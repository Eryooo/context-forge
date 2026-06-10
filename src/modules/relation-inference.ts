// ============================================================
// 关系推断模块 — 4 类关系推断 + 置信度评分 + 原型连线利用
// Step 5 核心逻辑,基于命名规则 + reactions(原型连线)。
// ============================================================

import type { Interaction, InteractionType, ActionType, TriggerElementType, UnresolvedQuestion } from '../schema/interaction'
import type { PageNode } from '../schema/page-graph'
import { createStableInteractionId, createStableQuestionId } from './utils/stable-id'

// ========== 命名规则(PRD §9.5 典型规则) ==========

const ACTION_KEYWORDS = {
  navigate: ['查看', '详情', '进入', 'view', 'detail', 'goto', 'open'],
  openModal: ['新增', '编辑', '删除确认', '创建', 'add', 'edit', 'create', 'delete', 'confirm'],
  closeModal: ['关闭', '取消', '返回', 'close', 'cancel', 'back'],
  submitForm: ['提交', '保存', '确认', 'submit', 'save', 'confirm', 'ok'],
  goBack: ['返回', '上一步', 'back', 'previous'],
  refresh: ['刷新', '重新加载', 'refresh', 'reload'],
}

// ========== 候选交互识别(遍历页面找按钮/链接/表单) ==========

export interface InteractionCandidate {
  fromPageId: string
  triggerElement: string
  triggerElementType: TriggerElementType
  triggerNodeId: string
  // 原型连线(如果有)
  prototypeAction?: {
    trigger: string             // e.g. "ON_CLICK"
    actionType: string          // e.g. "NODE" / "BACK" / "URL" / "CLOSE"
    navigation?: string         // e.g. "NAVIGATE" / "OVERLAY" / "SWAP"
    destinationId?: string      // 目标节点 ID
  }
}

export function findInteractionCandidates(
  pageNode: any,
  pageId: string
): InteractionCandidate[] {
  const candidates: InteractionCandidate[] = []

  // 遍历页面节点,找按钮/链接/表单提交
  const walk = (node: any) => {
    const name = (node.name || '').toLowerCase()

    // ===== 最高优先级:任何节点有原型连线(reactions)就识别为交互 =====
    // 这是最可靠的信号,不依赖命名。之前的 bug 是只在命名匹配后才读 reactions。
    const reactions = (node as any).reactions as any[] | undefined
    const hasReaction = Array.isArray(reactions) && reactions.length > 0

    // 判断是否为触发元素(放宽规则,增加匹配)
    let triggerType: TriggerElementType | null = null

    // 按钮(多种命名方式)
    if (name.includes('按钮') || name.includes('button') || name.includes('btn') ||
        name.includes('操作') || name.includes('action')) {
      triggerType = 'button'
    }
    // 链接
    else if (name.includes('链接') || name.includes('link') || name.includes('导航')) {
      triggerType = 'link'
    }
    // 图标(可能是可点击的)
    else if (name.includes('图标') || name.includes('icon') || name.includes('ico')) {
      triggerType = 'icon'
    }
    // 列表项(常见交互)
    else if (name.includes('列表项') || name.includes('list-item') || name.includes('item') ||
             name.includes('卡片') || name.includes('card')) {
      triggerType = 'listItem'
    }
    // 表单提交
    else if (name.includes('提交') || name.includes('submit') || name.includes('确认')) {
      triggerType = 'formSubmit'
    }
    // 关闭
    else if (name.includes('关闭') || name.includes('close') || name.includes('取消')) {
      triggerType = 'closeIcon'
    }
    // 返回
    else if (name.includes('返回') || name.includes('back') || name.includes('上一步')) {
      triggerType = 'backButton'
    }
    // Tab 切换
    else if (name.includes('tab') || name.includes('标签') || name.includes('切换')) {
      triggerType = 'tab'
    }
    // 如果节点类型是 INSTANCE 且主组件名包含交互词,也识别为触发元素
    else if (node.type === 'INSTANCE') {
      const compName = ((node as any).mainComponent?.name || '').toLowerCase()
      if (compName.includes('button') || compName.includes('btn') || compName.includes('按钮')) {
        triggerType = 'button'
      }
    }

    // 有原型连线但命名没匹配到 → 仍识别为交互(类型按 unknown)
    if (!triggerType && hasReaction) {
      triggerType = 'unknown'
    }

    if (triggerType) {
      const candidate: InteractionCandidate = {
        fromPageId: pageId,
        triggerElement: node.name || '未命名元素',
        triggerElementType: triggerType,
        triggerNodeId: node.id,
      }

      // 记录原型连线(如果有)
      if (hasReaction) {
        const reaction = reactions![0] // 取第一个
        candidate.prototypeAction = {
          trigger: reaction.trigger?.type || 'ON_CLICK',
          actionType: reaction.action?.type || 'NODE',
          navigation: reaction.action?.navigation,
          destinationId: reaction.action?.destinationId,
        }
      }

      candidates.push(candidate)
    }

    // 递归子节点
    const children = (node.children || []) as any[]
    children.forEach(c => walk(c))
  }

  walk(pageNode)
  return candidates
}

// ========== 关系推断(基于命名 + reactions) ==========

export function inferInteraction(
  candidate: InteractionCandidate,
  allPages: PageNode[]
): Interaction | null {
  const triggerName = candidate.triggerElement.toLowerCase()

  // 优先:原型连线(高置信度)
  if (candidate.prototypeAction && candidate.prototypeAction.destinationId) {
    return inferFromPrototype(candidate, allPages)
  }

  // 次优:命名规则
  return inferFromNaming(candidate, allPages)
}

// 从原型连线推断(高置信度 0.9)
function inferFromPrototype(
  candidate: InteractionCandidate,
  allPages: PageNode[]
): Interaction | null {
  const proto = candidate.prototypeAction!
  const targetPage = allPages.find(p => p.nodeId === proto.destinationId)
  if (!targetPage) return null

  // 判断 interactionType
  let interactionType: InteractionType = 'navigation'
  let actionType: ActionType = 'navigate'
  let targetType: 'page' | 'overlay' | 'state' | 'unknown' = 'page'

  if (proto.navigation === 'OVERLAY') {
    interactionType = 'overlay'
    actionType = targetPage.pageType === 'drawer' ? 'openDrawer' : 'openModal'
    targetType = 'overlay'
  } else if (proto.actionType === 'BACK') {
    interactionType = 'navigation'
    actionType = 'goBack'
  } else if (proto.actionType === 'CLOSE') {
    interactionType = 'overlay'
    actionType = 'closeModal'
  }

  const naturalLang = `当用户在【${getPageName(candidate.fromPageId, allPages)}】点击【${candidate.triggerElement}】时,执行【${actionType}】,目标为【${targetPage.pageName}】。`

  return {
    id: createStableInteractionId(candidate.fromPageId, candidate.triggerNodeId, actionType, targetPage.pageId),
    interactionType,
    fromPage: candidate.fromPageId,
    triggerElement: candidate.triggerElement,
    triggerElementType: candidate.triggerElementType,
    actionType,
    targetType,
    targetPageId: targetType === 'page' ? targetPage.pageId : undefined,
    targetOverlayId: targetType === 'overlay' ? targetPage.pageId : undefined,
    condition: `用户点击【${candidate.triggerElement}】`,
    expectedState: `跳转到【${targetPage.pageName}】`,
    confidence: 0.9,
    source: ['prototype'], // 审计 4.5:source 改数组
    evidence: `reactions.action.destinationId=${proto.destinationId}`,
    confirmedByUser: false,
    userModified: false,
    naturalLanguage: naturalLang,
  }
}

// 从命名规则推断(中置信度 0.6–0.75)
function inferFromNaming(
  candidate: InteractionCandidate,
  allPages: PageNode[]
): Interaction | null {
  const triggerName = candidate.triggerElement.toLowerCase()

  // 匹配动作关键词
  let actionType: ActionType = 'unknown'
  let confidence = 0.6

  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    if (keywords.some(kw => triggerName.includes(kw))) {
      actionType = action as ActionType
      confidence = 0.7
      break
    }
  }

  if (actionType === 'unknown') return null

  // 推断目标页面
  let targetPage: PageNode | undefined
  let interactionType: InteractionType = 'navigation'
  let targetType: 'page' | 'overlay' | 'unknown' = 'page'

  if (actionType === 'openModal') {
    interactionType = 'overlay'
    targetType = 'overlay'
    // 查找名称相关的 modal/drawer
    const modalKeyword = extractKeyword(triggerName)
    targetPage = allPages.find(p =>
      (p.pageType === 'modal' || p.pageType === 'drawer') &&
      p.pageName.toLowerCase().includes(modalKeyword)
    )
  } else if (actionType === 'navigate') {
    // 查找详情页/列表页
    const keyword = extractKeyword(triggerName)
    targetPage = allPages.find(p =>
      (p.pageType === 'detail' || p.pageType === 'list') &&
      p.pageName.toLowerCase().includes(keyword)
    )
  } else if (actionType === 'closeModal' || actionType === 'goBack') {
    interactionType = 'overlay'
    targetType = 'unknown'
    // 关闭/返回一般无明确目标,不填 target(审计 7.3 要求进待确认队列)
  }

  // 如果推断不出目标,降低置信度并进入待确认队列
  if (!targetPage && (actionType === 'openModal' || actionType === 'navigate')) {
    confidence = 0.5
    targetType = 'unknown'
  }

  const naturalLang = targetPage
    ? `当用户在【${getPageName(candidate.fromPageId, allPages)}】点击【${candidate.triggerElement}】时,执行【${actionType}】,目标为【${targetPage.pageName}】。`
    : `当用户在【${getPageName(candidate.fromPageId, allPages)}】点击【${candidate.triggerElement}】时,执行【${actionType}】,目标未确定。`

  return {
    id: createStableInteractionId(candidate.fromPageId, candidate.triggerNodeId, actionType, targetPage?.pageId),
    interactionType,
    fromPage: candidate.fromPageId,
    triggerElement: candidate.triggerElement,
    triggerElementType: candidate.triggerElementType,
    actionType,
    targetType,
    targetPageId: targetType === 'page' && targetPage ? targetPage.pageId : undefined,
    targetOverlayId: targetType === 'overlay' && targetPage ? targetPage.pageId : undefined,
    condition: `用户点击【${candidate.triggerElement}】`,
    expectedState: targetPage ? `跳转到【${targetPage.pageName}】` : '目标页面待确认',
    confidence,
    source: ['rule', 'naming'], // 审计 4.5:source 数组,naming 来源
    evidence: `命名包含关键词:${actionType}`,
    confirmedByUser: false,
    userModified: false,
    naturalLanguage: naturalLang,
  }
}

// 提取关键词(如"新增任务按钮"→"任务")
function extractKeyword(name: string): string {
  // 去除动作词
  let keyword = name
  const stopWords = ['按钮', '链接', '图标', 'button', 'link', 'icon', '新增', '编辑', '删除', '查看', 'add', 'edit', 'delete', 'view']
  stopWords.forEach(sw => {
    keyword = keyword.replace(sw, '')
  })
  return keyword.trim() || name
}

function getPageName(pageId: string, allPages: PageNode[]): string {
  return allPages.find(p => p.pageId === pageId)?.pageName || '未知页面'
}

// ========== 生成待确认问题队列(低置信度关系) ==========

export function generateUnresolvedQuestions(
  interactions: Interaction[],
  allPages: PageNode[]
): UnresolvedQuestion[] {
  const questions: UnresolvedQuestion[] = []

  interactions.forEach(inter => {
    const hasTarget = !!(inter.targetPageId || inter.targetOverlayId || inter.targetStateId)
    if (inter.confidence < 0.6 || !hasTarget) {
      const fromPageName = getPageName(inter.fromPage, allPages)
      const question: UnresolvedQuestion = {
        id: createStableQuestionId(
          `在【${fromPageName}】点击【${inter.triggerElement}】后,应该跳转到哪个页面?`,
          inter.fromPage,
          inter.triggerElement
        ),
        question: `在【${fromPageName}】点击【${inter.triggerElement}】后,应该跳转到哪个页面?`,
        relatedPage: inter.fromPage,
        relatedElement: inter.triggerElement,
        suggestedOptions: allPages
          .filter(p => p.pageType !== 'component' && p.pageType !== 'unknown')
          .map(p => p.pageName)
          .slice(0, 5),
        relatedInteractionId: inter.id,
      }
      questions.push(question)
    }
  })

  return questions
}

// ========== 状态关系推断(base 页面 → 状态页) ==========

export function inferStateRelations(
  basePage: PageNode,
  statePages: PageNode[]
): Interaction[] {
  const relations: Interaction[] = []

  statePages.forEach(statePage => {
    const naturalLang = `当【${basePage.pageName}】处于【${statePage.pageType}】状态时,展示【${statePage.pageName}】。`
    relations.push({
      id: createStableInteractionId(basePage.pageId, undefined, 'showState', statePage.pageId),
      interactionType: 'state',
      fromPage: basePage.pageId,
      actionType: 'showState',
      targetType: 'state',
      targetStateId: statePage.pageId,
      condition: `${basePage.pageName} 处于特定状态`,
      expectedState: `展示 ${statePage.pageName}`,
      confidence: 0.8,
      source: ['rule', 'layout'], // 审计 4.5:source 数组,layout 来源(位置推断)
      evidence: `命名规则识别为状态页`,
      confirmedByUser: false,
      userModified: false,
      naturalLanguage: naturalLang,
    })
  })

  return relations
}
