// ============================================================
// 页面识别模块 — 页面类型分类(13 种)+ 置信度评分
// Step 4 核心逻辑,基于命名规则 + 节点特征。
// ============================================================

import type { PageType, PageNode } from '../schema/page-graph'
import type { NodeSummary } from './collector'

// ========== 命名规则(PRD §9.5) ==========

const NAMING_RULES = {
  entry: ['登录', '启动', '引导', '欢迎', 'login', 'splash', 'onboard', 'welcome'],
  home: ['首页', '工作台', '主页', 'home', 'dashboard', 'workspace'],
  list: ['列表', '清单', 'list', 'table', 'grid'],
  detail: ['详情', '详细', 'detail', 'info'],
  form: ['表单', '新增', '编辑', '创建', 'form', 'add', 'edit', 'create', 'new'],
  modal: ['弹窗', '对话框', 'modal', 'dialog', 'popup'],
  drawer: ['抽屉', '侧边栏', 'drawer', 'sidebar', 'panel'],
  state_empty: ['空', '暂无', 'empty', 'no-data', 'blank'],
  state_loading: ['加载', 'loading', 'spinner'],
  state_error: ['错误', '失败', 'error', 'fail'],
  state_success: ['成功', '完成', 'success', 'done', 'complete'],
  component: ['组件', '素材', 'component', 'widget', 'module'],
}

// ========== 页面类型识别 ==========

export function classifyPageType(
  node: any,
  nodeSummary: NodeSummary
): { type: PageType; confidence: number } {
  const name = (node.name || '').toLowerCase()

  // 遍历规则,计算匹配度
  const scores: Array<{ type: PageType; score: number }> = []

  for (const [typeKey, keywords] of Object.entries(NAMING_RULES)) {
    let score = 0
    for (const kw of keywords) {
      if (name.includes(kw.toLowerCase())) {
        score += 1.0 // 完整匹配
      }
    }
    if (score > 0) {
      scores.push({ type: typeKey as PageType, score })
    }
  }

  // 特征辅助判断(无命名匹配时)
  if (scores.length === 0) {
    // 尺寸特征:小尺寸可能是 modal/drawer
    const w = nodeSummary.width
    const h = nodeSummary.height
    if (w < 600 && h < 600) {
      scores.push({ type: 'modal', score: 0.4 })
    }
    if (w < 400 && h > 600) {
      scores.push({ type: 'drawer', score: 0.4 })
    }

    // 默认 unknown
    if (scores.length === 0) {
      return { type: 'unknown', confidence: 0.3 }
    }
  }

  // 取最高分
  scores.sort((a, b) => b.score - a.score)
  const best = scores[0]

  // 置信度归一化:1 个匹配词 → 0.7;2 个 → 0.85;3+ → 0.95
  let confidence = Math.min(0.95, 0.7 + best.score * 0.15)

  return { type: best.type, confidence }
}

// ========== 弹窗 / 抽屉识别(基于尺寸 + 命名) ==========

export function isModal(node: any): boolean {
  const name = (node.name || '').toLowerCase()
  const w = node.width ?? 0
  const h = node.height ?? 0

  // 命名优先
  if (NAMING_RULES.modal.some(kw => name.includes(kw))) return true

  // 尺寸辅助:宽高都较小,且不是极小(排除图标)
  return w > 300 && w < 800 && h > 200 && h < 700
}

export function isDrawer(node: any): boolean {
  const name = (node.name || '').toLowerCase()
  const w = node.width ?? 0
  const h = node.height ?? 0

  if (NAMING_RULES.drawer.some(kw => name.includes(kw))) return true

  // 尺寸辅助:窄高条
  return w < 500 && h > 600
}

// ========== 状态页识别(挂在 base 页面下) ==========

export function detectStatePages(
  candidates: SceneNode[]
): Array<{ stateNode: SceneNode; baseNode?: SceneNode; stateType: PageType }> {
  const states: Array<{ stateNode: SceneNode; baseNode?: SceneNode; stateType: PageType }> = []

  for (const node of candidates) {
    const name = (node.name || '').toLowerCase()

    // 检查是否为状态页(扩展规则)
    let stateType: PageType | null = null
    if (NAMING_RULES.state_empty.some(kw => name.includes(kw))) stateType = 'state_empty'
    else if (NAMING_RULES.state_loading.some(kw => name.includes(kw))) stateType = 'state_loading'
    else if (NAMING_RULES.state_error.some(kw => name.includes(kw))) stateType = 'state_error'
    else if (NAMING_RULES.state_success.some(kw => name.includes(kw))) stateType = 'state_success'
    // 扩展:"-输入"、"-编辑"、"-查看"等也是状态
    else if (name.includes('-输入') || name.includes('-input') || name.includes('输入态')) {
      stateType = 'state_empty' // 归类为特殊状态
    }
    else if (name.includes('-编辑') || name.includes('-edit') || name.includes('编辑态')) {
      stateType = 'state_empty'
    }
    else if (name.includes('-查看') || name.includes('-view') || name.includes('查看态')) {
      stateType = 'state_empty'
    }

    if (stateType) {
      // 尝试找到 base 页面(同名前缀,如"快捷指令-输入"→base="快捷指令")
      const baseName = name.split(/[-_]/)[0].trim()
      const baseNode = candidates.find(c => {
        const cName = (c.name || '').toLowerCase().trim()
        // 完全匹配 baseName,且不是当前节点,且不是状态页
        return cName === baseName && c.id !== node.id && !isStateRelatedName(cName)
      })

      states.push({ stateNode: node, baseNode, stateType })
    }
  }

  return states
}

function isStateRelatedName(name: string): boolean {
  return [...NAMING_RULES.state_empty, ...NAMING_RULES.state_loading, ...NAMING_RULES.state_error, ...NAMING_RULES.state_success]
    .some(kw => name.includes(kw))
}

// ========== 组件识别(排除素材库) ==========

export function isComponentLibrary(node: any): boolean {
  const name = (node.name || '').toLowerCase()
  return NAMING_RULES.component.some(kw => name.includes(kw))
}

// ========== 页面摘要生成(快速理解) ==========

export function generatePageSummary(node: any, nodeSummary: NodeSummary): PageNode['summary'] {
  // 分析布局(AutoLayout / 绝对定位)
  let layout = '未检测到明显布局'
  if (nodeSummary.flexMode && nodeSummary.flexMode !== 'NONE') {
    layout = nodeSummary.flexMode === 'HORIZONTAL' ? '横向布局(AutoLayout)' : '纵向布局(AutoLayout)'
  }

  // 主区域(简化版:找顶层子节点)
  const mainRegions: string[] = []
  const children = (node.children || []) as any[]
  if (children.length > 0) {
    children.slice(0, 5).forEach((c: any) => {
      if (c.name) mainRegions.push(c.name)
    })
  }

  // 关键元素(按钮/输入框/文本)
  const keyElements: string[] = []
  const buttons = children.filter((c: any) => {
    const n = (c.name || '').toLowerCase()
    return n.includes('按钮') || n.includes('button') || n.includes('btn')
  })
  const inputs = children.filter((c: any) => {
    const n = (c.name || '').toLowerCase()
    return n.includes('输入') || n.includes('input') || n.includes('搜索') || n.includes('search')
  })
  if (buttons.length > 0) keyElements.push(`${buttons.length} 个按钮`)
  if (inputs.length > 0) keyElements.push(`${inputs.length} 个输入框`)

  // 交互元素检测
  const hasInteraction = buttons.length > 0 || inputs.length > 0

  // 复杂度(简单:子节点<10;中等:10–50;复杂:>50)
  let complexity: 'simple' | 'medium' | 'complex' = 'simple'
  if (children.length > 50) complexity = 'complex'
  else if (children.length > 10) complexity = 'medium'

  return {
    layout,
    mainRegions: mainRegions.length > 0 ? mainRegions : ['未识别出子区域'],
    keyElements: keyElements.length > 0 ? keyElements : ['未检测到明显交互元素'],
    hasInteraction,
    complexity,
  }
}

// ========== 入口页识别(用于 PageGraph.entryPage) ==========

export function identifyEntryPage(pages: PageNode[]): string | undefined {
  // 优先级:明确命名"登录/启动" > 首个 entry 类型 > 首个 home 类型
  const explicitEntry = pages.find(p => {
    const n = p.pageName.toLowerCase()
    return NAMING_RULES.entry.some(kw => n.includes(kw))
  })
  if (explicitEntry) return explicitEntry.pageId

  const entryTypePage = pages.find(p => p.pageType === 'entry')
  if (entryTypePage) return entryTypePage.pageId

  const homePage = pages.find(p => p.pageType === 'home')
  if (homePage) return homePage.pageId

  // 实在没有,返回第一个非 modal/drawer/state 的主页面
  const mainPage = pages.find(p =>
    !p.pageType.startsWith('state_') && p.pageType !== 'modal' && p.pageType !== 'drawer' && p.pageType !== 'component'
  )
  return mainPage?.pageId
}
