// ============================================================
// 页面图谱 Schema — 页面清单、类型、分组
// ============================================================

// 页面类型(PRD §8.2 定义的 13 种)
export type PageType =
  | 'entry'       // 入口页(登录/启动/引导)
  | 'home'        // 首页/工作台
  | 'list'        // 列表页
  | 'detail'      // 详情页
  | 'form'        // 表单页
  | 'modal'       // 弹窗
  | 'drawer'      // 抽屉
  | 'state_empty'    // 空状态
  | 'state_loading'  // 加载状态
  | 'state_error'    // 错误状态
  | 'state_success'  // 成功状态
  | 'component'      // 组件素材
  | 'unknown'        // 未知

// 数据状态(降级链路)
export type DataStatus = 'success' | 'fallback' | 'unavailable' | 'failed'

// 单个页面
export interface PageNode {
  pageId: string           // 唯一 ID(基于 MasterGo nodeId 生成)
  pageName: string         // 页面名称(基于节点 name,可能被用户改名)
  pageType: PageType       // 页面类型
  nodeId: string           // MasterGo 原始节点 ID

  // 数据引用
  dslRef?: string          // pages/{pageId}/dsl.json
  htmlRef?: string         // pages/{pageId}/html.html
  screenshotRef?: string   // pages/{pageId}/screenshot.png

  // 数据状态
  dslStatus: DataStatus
  htmlStatus: DataStatus
  screenshotStatus: DataStatus

  // 页面摘要(为外部 AI 提供快速理解)
  summary: {
    layout: string         // e.g. "左侧导航 + 顶部栏 + 内容区"
    mainRegions: string[]  // e.g. ["导航区","筛选区","任务列表"]
    keyElements: string[]  // e.g. ["新增按钮","搜索框","任务列表项"]
    hasInteraction: boolean // 是否有交互元素(按钮/输入框/链接)
    complexity: 'simple' | 'medium' | 'complex' // 页面复杂度
    // R3-S9:深层扫描统计(button/input/table 等组件计数 + 扫描元信息)
    componentStats?: Record<string, number>
    scanStats?: {
      totalNodesScanned: number
      maxDepthReached: number
    }
  }

  // 识别置信度
  typeConfidence: number   // 0–1,页面类型识别置信度

  // 用户修改标记
  userConfirmed: boolean   // 用户是否手动确认过
  userModified: boolean    // 用户是否改过类型/名称

  // R3-S2:入口页 / 排除标记(用户在 PageReviewPanel 设置)
  isEntryPage?: boolean    // 用户手动设为入口页(优先于自动 identifyEntryPage)
  excluded?: boolean       // 用户排除该页面(不进 mainFlow / interaction target / 导出 pages)
}

// 页面分组(主页面 vs 浮层 vs 状态 vs 未归属)
export interface PageGroup {
  basePage?: string        // 基础页面 ID(如果是浮层/状态,挂在哪个主页面下)
  children: PageChild[]    // 子页面(弹窗/抽屉/状态)
}

export interface PageChild {
  pageId: string
  relationType: 'overlay' | 'state'  // overlay=弹窗/抽屉; state=状态页
}

// 页面图谱(顶层)
export interface PageGraph {
  entryPage?: string       // 入口页面 ID
  mainFlow: string[]       // 主流程页面序列(按用户旅程排序)

  // 页面分组
  pageGroups: PageGroup[]

  // 未归属页面(识别出来但不知道挂哪)
  unclassified: string[]

  // 元信息
  totalPages: number
  mainPageCount: number
  overlayCount: number
  stateCount: number
  unknownCount: number
}

// 页面清单(所有页面的 flat list)
export interface PageList {
  pages: PageNode[]
}
