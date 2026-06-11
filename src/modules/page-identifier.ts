// ============================================================
// 页面识别模块 — 页面类型分类(13 种)+ 置信度评分
// Step 4 核心逻辑,基于命名规则 + 节点特征。
// ============================================================

import type { PageType, PageNode } from '../schema/page-graph'
import type { NodeSummary } from './collector'
import { scanDeep } from './identify/deep-summary'

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

// ========== 页面类型识别(审计 9.3:优先级排序,避免 form 抢 modal)==========

export function classifyPageType(
  node: any,
  nodeSummary: NodeSummary
): { type: PageType; confidence: number } {
  const name = (node.name || '').toLowerCase()

  // 审计 9.3:优先级判断,state_* > modal/drawer > entry/home/list/detail/form > component > unknown
  // 先匹配高优先级,匹配即返回,避免"新增任务弹窗"被 form 抢走而非 modal

  // P1: state_* (最高优先级)
  for (const kw of NAMING_RULES.state_empty) {
    if (name.includes(kw.toLowerCase())) return { type: 'state_empty', confidence: 0.85 }
  }
  for (const kw of NAMING_RULES.state_loading) {
    if (name.includes(kw.toLowerCase())) return { type: 'state_loading', confidence: 0.85 }
  }
  for (const kw of NAMING_RULES.state_error) {
    if (name.includes(kw.toLowerCase())) return { type: 'state_error', confidence: 0.85 }
  }
  for (const kw of NAMING_RULES.state_success) {
    if (name.includes(kw.toLowerCase())) return { type: 'state_success', confidence: 0.85 }
  }

  // P2: modal/drawer(审计:弹窗/modal/dialog/popup→modal;抽屉/drawer→drawer)
  for (const kw of NAMING_RULES.modal) {
    if (name.includes(kw.toLowerCase())) return { type: 'modal', confidence: 0.85 }
  }
  for (const kw of NAMING_RULES.drawer) {
    if (name.includes(kw.toLowerCase())) return { type: 'drawer', confidence: 0.85 }
  }

  // P3: entry/home/list/detail/form
  for (const kw of NAMING_RULES.entry) {
    if (name.includes(kw.toLowerCase())) return { type: 'entry', confidence: 0.8 }
  }
  for (const kw of NAMING_RULES.home) {
    if (name.includes(kw.toLowerCase())) return { type: 'home', confidence: 0.8 }
  }
  for (const kw of NAMING_RULES.list) {
    if (name.includes(kw.toLowerCase())) return { type: 'list', confidence: 0.75 }
  }
  for (const kw of NAMING_RULES.detail) {
    if (name.includes(kw.toLowerCase())) return { type: 'detail', confidence: 0.75 }
  }
  for (const kw of NAMING_RULES.form) {
    if (name.includes(kw.toLowerCase())) return { type: 'form', confidence: 0.7 }
  }

  // P4: component
  for (const kw of NAMING_RULES.component) {
    if (name.includes(kw.toLowerCase())) return { type: 'component', confidence: 0.6 }
  }

  // 无命名匹配时,尺寸特征辅助
  const w = nodeSummary.width
  const h = nodeSummary.height
  if (w < 600 && h < 600) return { type: 'modal', confidence: 0.4 }
  if (w < 400 && h > 600) return { type: 'drawer', confidence: 0.4 }

  // 默认 unknown
  return { type: 'unknown', confidence: 0.3 }
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

  // 审计 A8/9.5:深层扫描(maxDepth6/maxNodes1000),替代原单层 node.children 扫描
  const deep = scanDeep(node, 6, 1000)
  const children = (node.children || []) as any[]

  // 主区域:优先用深层扫描识别的区域,兜底用顶层子节点名
  let mainRegions: string[] = deep.mainRegions
  if (mainRegions.length === 0 && children.length > 0) {
    mainRegions = children.slice(0, 5).map((c: any) => c.name).filter(Boolean)
  }

  // 关键元素:用深层扫描的组件统计(button/input/table/list/...),比原来只数顶层更准
  const keyElements: string[] = []
  const stats = deep.componentStats
  const labelMap: Record<string, string> = {
    button: '按钮', input: '输入框', search: '搜索框', table: '表格', list: '列表',
    card: '卡片', form: '表单', tab: '标签页', modal: '弹窗', drawer: '抽屉',
    pagination: '分页', checkbox: '复选框', radio: '单选框', select: '下拉框',
    dropdown: '下拉菜单', menu: '菜单', link: '链接', switch: '开关',
  }
  Object.entries(stats).forEach(([type, count]) => {
    const label = labelMap[type] || type
    keyElements.push(`${count} 个${label}`)
  })

  // 交互元素检测:有 button/input/link/select 等即视为有交互
  const hasInteraction = !!(stats.button || stats.input || stats.link || stats.select || stats.tab || stats.search)

  // 复杂度:用深层扫描的总节点数(比顶层 children 数更真实)
  const totalNodes = deep.totalNodesScanned
  let complexity: 'simple' | 'medium' | 'complex' = 'simple'
  if (totalNodes > 100) complexity = 'complex'
  else if (totalNodes > 30) complexity = 'medium'

  return {
    layout,
    mainRegions: mainRegions.length > 0 ? mainRegions : ['未识别出子区域'],
    keyElements: keyElements.length > 0 ? keyElements : ['未检测到明显交互元素'],
    hasInteraction,
    complexity,
    // R3-S9:暴露深层扫描统计,供外部 AI / 质量面板使用
    componentStats: stats,
    scanStats: {
      totalNodesScanned: deep.totalNodesScanned,
      maxDepthReached: deep.maxDepthReached,
    },
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
