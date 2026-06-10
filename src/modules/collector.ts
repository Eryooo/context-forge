// ============================================================
// 采集模块 — 选区读取 + 节点树遍历 + 属性摘要 + 截图 + DSL
// Step 3 核心逻辑,所有采集围绕 Schema 定义。
// ============================================================

import type { PageNode, DataStatus } from '../schema/page-graph'

// ========== 配置 ==========

const CONFIG = {
  MAX_DEPTH: 10,              // 受控递归最大深度(PRD §7.3)
  MAX_CHILDREN_PER_NODE: 200, // 每层最多遍历节点数
  MAX_NODES_PER_PAGE: 3000,   // 单页最多统计节点数
  SCREENSHOT_SCALE: 1,        // 截图缩放比例
  MAX_SCREENSHOTS: 50,        // 最多导出截图数(防止包过大)
}

// ========== 1. 选区读取 ==========

export function getSelection(): ReadonlyArray<SceneNode> {
  try {
    return mg.document.currentPage.selection
  } catch {
    return []
  }
}

export function getCurrentPageTopLevelNodes(): ReadonlyArray<SceneNode> {
  try {
    const page = mg.document.currentPage
    return page.children || []
  } catch {
    return []
  }
}

// ========== 2. 节点树遍历(受控递归) ==========

interface WalkStats {
  nodeCount: number
  maxDepth: number
  stopped: boolean
}

export function walkTree(
  root: SceneNode,
  visitor: (node: SceneNode, depth: number) => void
): WalkStats {
  const stats: WalkStats = { nodeCount: 0, maxDepth: 0, stopped: false }

  const walk = (node: any, depth: number) => {
    if (stats.stopped) return
    if (depth > CONFIG.MAX_DEPTH) {
      stats.stopped = true
      return
    }
    if (stats.nodeCount >= CONFIG.MAX_NODES_PER_PAGE) {
      stats.stopped = true
      return
    }

    stats.nodeCount++
    stats.maxDepth = Math.max(stats.maxDepth, depth)
    visitor(node, depth)

    const children = safeGet(() => (node as any).children) as any[] | undefined
    if (Array.isArray(children)) {
      const limited = children.slice(0, CONFIG.MAX_CHILDREN_PER_NODE)
      for (const child of limited) {
        walk(child, depth + 1)
      }
    }
  }

  walk(root, 0)
  return stats
}

function safeGet<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

// ========== 3. 页面候选识别(根据命名/类型/尺寸筛选 Frame) ==========

export function identifyPageCandidates(nodes: ReadonlyArray<SceneNode>): SceneNode[] {
  const candidates: SceneNode[] = []
  const processedIds = new Set<string>() // 避免重复

  for (const node of nodes) {
    // 只处理顶层选中节点,不递归其子节点(避免把嵌套 Frame 误识别成独立页面)
    if (isPageCandidate(node) && !processedIds.has(node.id)) {
      candidates.push(node)
      processedIds.add(node.id)
    }
  }

  return candidates
}

function isPageCandidate(node: any): boolean {
  // 类型筛选:FRAME / SECTION / COMPONENT
  if (!['FRAME', 'SECTION', 'COMPONENT'].includes(node.type)) return false

  // 尺寸筛选:过小的排除(装饰/图标)
  const w = safeGet(() => node.width) ?? 0
  const h = safeGet(() => node.height) ?? 0
  if (w < 200 || h < 200) return false

  // 可见性
  const visible = safeGet(() => node.isVisible) ?? true
  if (!visible) return false

  // 命名规则:包含"页/首页/列表/详情/弹窗/抽屉"等关键词
  const name = (node.name || '').toLowerCase()
  const keywords = ['页', '首页', '列表', '详情', '弹窗', '抽屉', 'page', 'home', 'list', 'detail', 'modal', 'drawer', '登录', 'login', '表单', 'form']
  const hasKeyword = keywords.some(k => name.includes(k))

  // 设备尺寸:常见设备宽度(375/414/768/1024/1440/1920)
  const deviceWidths = [375, 414, 768, 1024, 1440, 1920]
  const isDeviceWidth = deviceWidths.some(dw => Math.abs(w - dw) < 20)

  // 通过:有关键词 或 是设备尺寸
  return hasKeyword || isDeviceWidth
}

// ========== 4. 节点属性摘要 ==========

export interface NodeSummary {
  id: string
  name: string
  type: string
  width: number
  height: number
  x: number
  y: number
  isVisible: boolean

  // 样式
  fills?: any[]
  strokes?: any[]
  cornerRadius?: number | symbol
  opacity?: number

  // AutoLayout
  flexMode?: string
  itemSpacing?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number

  // 文本(如果是 TEXT 节点)
  characters?: string
  fontName?: any
  textAlignHorizontal?: string

  // 组件(如果是 INSTANCE)
  mainComponent?: any
  componentProperties?: any[]
}

export function summarizeNode(node: any): NodeSummary {
  const summary: NodeSummary = {
    id: node.id,
    name: node.name,
    type: node.type,
    width: safeGet(() => node.width) ?? 0,
    height: safeGet(() => node.height) ?? 0,
    x: safeGet(() => node.x) ?? 0,
    y: safeGet(() => node.y) ?? 0,
    isVisible: safeGet(() => node.isVisible) ?? true,
  }

  // 样式
  summary.fills = safeGet(() => node.fills)
  summary.strokes = safeGet(() => node.strokes)
  summary.cornerRadius = safeGet(() => node.cornerRadius)
  summary.opacity = safeGet(() => node.opacity)

  // AutoLayout
  summary.flexMode = safeGet(() => node.flexMode)
  summary.itemSpacing = safeGet(() => node.itemSpacing)
  summary.paddingTop = safeGet(() => node.paddingTop)
  summary.paddingRight = safeGet(() => node.paddingRight)
  summary.paddingBottom = safeGet(() => node.paddingBottom)
  summary.paddingLeft = safeGet(() => node.paddingLeft)

  // 文本
  if (node.type === 'TEXT') {
    summary.characters = safeGet(() => node.characters)
    summary.fontName = safeGet(() => node.fontName)
    summary.textAlignHorizontal = safeGet(() => node.textAlignHorizontal)
  }

  // 组件
  if (node.type === 'INSTANCE') {
    summary.mainComponent = safeGet(() => node.mainComponent)
    summary.componentProperties = safeGet(() => node.componentProperties)
  }

  return summary
}

// ========== 5. 截图导出 ==========

export async function exportScreenshot(node: any): Promise<{ data: Uint8Array; status: DataStatus } | null> {
  if (typeof node.exportAsync !== 'function') {
    return { data: new Uint8Array(0), status: 'unavailable' }
  }

  try {
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: CONFIG.SCREENSHOT_SCALE },
    })
    if (bytes instanceof Uint8Array && bytes.length > 0) {
      return { data: bytes, status: 'success' }
    }
    return { data: new Uint8Array(0), status: 'failed' }
  } catch (e) {
    console.error('exportScreenshot failed:', e)
    return { data: new Uint8Array(0), status: 'failed' }
  }
}

// Uint8Array → base64(手写实现,主线程无 btoa)
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  let i = 0

  while (i < bytes.length) {
    const byte1 = bytes[i++]
    const byte2 = i < bytes.length ? bytes[i++] : 0
    const byte3 = i < bytes.length ? bytes[i++] : 0

    const enc1 = byte1 >> 2
    const enc2 = ((byte1 & 3) << 4) | (byte2 >> 4)
    const enc3 = ((byte2 & 15) << 2) | (byte3 >> 6)
    const enc4 = byte3 & 63

    result += base64Chars[enc1] + base64Chars[enc2]
    result += (i - 1 < bytes.length) ? base64Chars[enc3] : '='
    result += (i < bytes.length) ? base64Chars[enc4] : '='
  }

  return result
}

// ========== 6. DSL 采集(三层降级) ==========

export interface DSLResult {
  dsl: any
  status: DataStatus
  source: 'codegen' | 'node_tree' | 'summary' // 优先级 1/2/3
}

// 优先级 1:尝试官方 codegen
async function tryCodegen(nodeId: string): Promise<{ dsl: any; ok: boolean }> {
  const cg: any = (mg as any).codegen
  if (typeof cg === 'undefined' || typeof cg.getDSL !== 'function') {
    return { dsl: null, ok: false }
  }

  // 尝试多个 framework(手册未明确,按常见值试)
  for (const fw of ['html', 'react', 'vue', 'css'] as const) {
    try {
      const dsl = await cg.getDSL(nodeId, fw)
      if (dsl) return { dsl, ok: true }
    } catch {
      // 继续尝试下一个
    }
  }
  return { dsl: null, ok: false }
}

// 优先级 2:自研节点树 DSL-like JSON
function buildNodeTreeDSL(node: any): any {
  const dsl: any = {
    id: node.id,
    name: node.name,
    type: node.type,
    layout: {
      width: safeGet(() => node.width),
      height: safeGet(() => node.height),
      x: safeGet(() => node.x),
      y: safeGet(() => node.y),
    },
    style: {},
    children: [],
  }

  // 样式
  const fills = safeGet(() => node.fills)
  if (Array.isArray(fills) && fills.length > 0) {
    dsl.style.fills = fills.map((f: any) => ({ type: f.type, color: f.color }))
  }
  const cornerRadius = safeGet(() => node.cornerRadius)
  if (cornerRadius !== undefined && typeof cornerRadius === 'number') {
    dsl.style.cornerRadius = cornerRadius
  }
  dsl.style.opacity = safeGet(() => node.opacity)

  // AutoLayout
  const flexMode = safeGet(() => node.flexMode)
  if (flexMode && flexMode !== 'NONE') {
    dsl.autoLayout = {
      flexMode,
      itemSpacing: safeGet(() => node.itemSpacing),
      paddingTop: safeGet(() => node.paddingTop),
      paddingRight: safeGet(() => node.paddingRight),
      paddingBottom: safeGet(() => node.paddingBottom),
      paddingLeft: safeGet(() => node.paddingLeft),
    }
  }

  // 文本
  if (node.type === 'TEXT') {
    dsl.text = {
      characters: safeGet(() => node.characters),
      fontName: safeGet(() => node.fontName),
      textAlignHorizontal: safeGet(() => node.textAlignHorizontal),
    }
  }

  // 递归子节点(受控深度)
  const children = safeGet(() => (node as any).children) as any[] | undefined
  if (Array.isArray(children) && children.length > 0) {
    // 限制子节点数量,避免过大
    const limited = children.slice(0, 50)
    dsl.children = limited.map(c => buildNodeTreeDSL(c))
  }

  return dsl
}

// 优先级 3:仅摘要(DSL 和节点树都失败时)
function buildSummaryOnly(node: any): any {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    summary: '节点树过大或 DSL 不可用,仅保留摘要。请参考截图。',
    layout: {
      width: safeGet(() => node.width),
      height: safeGet(() => node.height),
    },
  }
}

// 统一 DSL 采集入口(三层降级)
export async function collectDSL(node: any): Promise<DSLResult> {
  // 优先级 1:codegen
  const cgResult = await tryCodegen(node.id)
  if (cgResult.ok) {
    return { dsl: cgResult.dsl, status: 'success', source: 'codegen' }
  }

  // 优先级 2:节点树 DSL-like
  try {
    const treeDSL = buildNodeTreeDSL(node)
    return { dsl: treeDSL, status: 'fallback', source: 'node_tree' }
  } catch (e) {
    console.error('buildNodeTreeDSL failed:', e)
  }

  // 优先级 3:仅摘要
  const summary = buildSummaryOnly(node)
  return { dsl: summary, status: 'fallback', source: 'summary' }
}

// ========== 7. HTML / D2C 采集(不阻断主流程) ==========

export async function collectHTML(nodeId: string): Promise<{ html: string | null; status: DataStatus }> {
  const cg: any = (mg as any).codegen
  if (typeof cg === 'undefined' || typeof cg.getCode !== 'function') {
    return { html: null, status: 'unavailable' }
  }

  try {
    // 尝试 HTML framework
    const code = await cg.getCode(nodeId, 'html')
    if (code && typeof code === 'string') {
      return { html: code, status: 'success' }
    }
    return { html: null, status: 'unavailable' }
  } catch (e) {
    console.error('collectHTML failed:', e)
    return { html: null, status: 'unavailable' }
  }
}
