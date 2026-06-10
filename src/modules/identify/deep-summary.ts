// ============================================================
// 深层结构扫描(审计 9.5:maxDepth 6 / maxNodes 1000)
// 当前 generatePageSummary 只扫描 node.children(单层),
// 对于复杂嵌套页面(如弹窗内含多层表单)会遗漏深层元素。
// 本模块递归扫描,提取 button/input/table/list/modal/drawer/form 等关键元素。
// ============================================================

// 关键元素类型(审计 9.5 要求识别的典型 UI 元素)
const KEY_ELEMENT_TYPES = [
  'button', 'input', 'search', 'filter', 'tab', 'table', 'list', 'card',
  'modal', 'drawer', 'form', 'pagination', 'toast', 'empty', 'error', 'loading',
  'link', 'menu', 'dropdown', 'checkbox', 'radio', 'switch', 'select',
]

interface DeepSummary {
  componentStats: Record<string, number> // button:5, input:3, ...
  keyElements: string[]                  // ["登录按钮", "用户名输入框", ...]
  mainRegions: string[]                  // ["顶部导航", "内容区", "底部操作栏"]
  maxDepthReached: number
  totalNodesScanned: number
}

/**
 * 深层扫描节点树,提取关键元素和组件统计。
 * @param node 根节点
 * @param maxDepth 最大递归深度(防爆栈),默认 6
 * @param maxNodes 最大扫描节点数(防卡顿),默认 1000
 * @returns DeepSummary
 */
export function scanDeep(node: any, maxDepth = 6, maxNodes = 1000): DeepSummary {
  const componentStats: Record<string, number> = {}
  const keyElements: string[] = []
  const mainRegions: string[] = []
  let totalNodesScanned = 0
  let maxDepthReached = 0

  function traverse(n: any, depth: number) {
    if (totalNodesScanned >= maxNodes) return
    if (depth > maxDepth) return
    totalNodesScanned++
    maxDepthReached = Math.max(maxDepthReached, depth)

    const name = (n.name || '').toLowerCase()
    const type = (n.type || '').toLowerCase()

    // 识别关键元素类型
    let elementType: string | null = null
    for (const et of KEY_ELEMENT_TYPES) {
      if (name.includes(et) || type.includes(et)) {
        elementType = et
        break
      }
    }

    if (elementType) {
      componentStats[elementType] = (componentStats[elementType] || 0) + 1
      // 保留有意义的元素名称(避免"Frame 1234"之类)
      if (n.name && n.name.length > 2 && !/^(frame|group|rectangle|ellipse|vector)\s*\d*$/i.test(n.name)) {
        keyElements.push(n.name)
      }
    }

    // 识别主要区域(顶层容器,depth≤2 且名称含"导航/头部/内容/底部/侧边")
    if (depth <= 2 && n.name) {
      const regionKeywords = ['导航', '头部', 'header', '顶部', '内容', 'content', '底部', 'footer', '侧边', 'sidebar', '操作栏']
      if (regionKeywords.some(kw => name.includes(kw))) {
        mainRegions.push(n.name)
      }
    }

    // 递归子节点
    if (Array.isArray(n.children)) {
      for (const child of n.children) {
        traverse(child, depth + 1)
      }
    }
  }

  traverse(node, 0)

  return {
    componentStats,
    keyElements: keyElements.slice(0, 20), // 限制20个,避免 Prompt 过长
    mainRegions: mainRegions.slice(0, 5),
    maxDepthReached,
    totalNodesScanned,
  }
}
