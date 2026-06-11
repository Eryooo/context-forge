// ============================================================
// 导出净化 — sanitizePackageForExport
// 审计 P0:所有导出入口(JSON/Markdown/Prompt/未来 ZIP/历史保存)
// 必须先调用本函数,确保 apiKey 等敏感字段绝不进入产物。
// ============================================================

import type { AIContextPackage } from '@schema/package-schema'
import { redactSensitive } from '../security/redact'

/**
 * 深拷贝 + 脱敏数据包,返回可安全导出的副本。
 * 不修改原 pkg。
 *
 * 双保险:
 * 1. Schema 层面已移除 aiSettings(Step 1),理论上不该有 apiKey。
 * 2. 但 prdContext.rawPRD、未来可能误带入的字段,仍需 redactSensitive 兜底。
 *
 * 注意:本函数不剥离 rawPRD(rawPRD 是否导出由 ExportOptions.includeRawPRD 控制,
 * 在 exporter 层处理)。这里只负责剥离"敏感凭据"类字段(apiKey/token 等)。
 */
export function sanitizePackageForExport(pkg: AIContextPackage): AIContextPackage {
  // redactSensitive 会把 apiKey/authorization/bearer/token/secret/password 等 key 替换为 [REDACTED],
  // 并对字符串值做 Bearer/sk-/github_pat_ 脱敏。
  const cleaned = redactSensitive(pkg) as AIContextPackage
  return cleaned
}

/**
 * 按导出选项处理 rawPRD:
 * - 若用户未勾选 includeRawPRD,则从导出副本中移除 prdContext.rawPRD。
 * 在 sanitize 之后、序列化之前调用。
 */
export function applyRawPRDPolicy(
  pkg: AIContextPackage,
  includeRawPRD: boolean
): AIContextPackage {
  if (includeRawPRD) return pkg
  if (!pkg.prdContext || !pkg.prdContext.rawPRD) return pkg
  return {
    ...pkg,
    prdContext: {
      ...pkg.prdContext,
      rawPRD: undefined,
    },
  }
}

/**
 * R3.1-1:从导出副本中物理移除被排除(excluded)的页面。
 * 保证 excluded 页面不出现在 JSON / Prompt / Markdown / assets / interactions。
 *
 * 处理:
 * - pageList.pages:剔除 excluded
 * - assets.pages:删除对应 pageId 的资产
 * - interactionGraph.interactions:剔除「来源是 excluded」或「目标指向 excluded」的关系
 * - pageGraph:基于剩余 pages/interactions 已由 rebuildPageGraph 过滤(此处不重建,
 *   仅清理已过滤页面的残留引用,导出前 pkg 的 pageGraph 已是 recalculate 后的结果)
 *
 * 不修改原 pkg。
 */
export function stripExcludedPages(pkg: AIContextPackage): AIContextPackage {
  const excludedIds = new Set(
    pkg.pageList.pages.filter(p => p.excluded).map(p => p.pageId)
  )
  if (excludedIds.size === 0) return pkg

  // 1. 过滤 pageList
  const pages = pkg.pageList.pages.filter(p => !excludedIds.has(p.pageId))

  // 2. 过滤 assets
  let assets = pkg.assets
  if (assets && assets.pages) {
    const newAssetPages: Record<string, any> = {}
    for (const pid of Object.keys(assets.pages)) {
      if (!excludedIds.has(pid)) newAssetPages[pid] = assets.pages[pid]
    }
    assets = { ...assets, pages: newAssetPages }
  }

  // 3. 过滤 interactions:来源或任一目标指向 excluded 的关系都剔除
  const refsExcluded = (i: AIContextPackage['interactionGraph']['interactions'][number]) =>
    excludedIds.has(i.fromPage) ||
    (i.targetPageId ? excludedIds.has(i.targetPageId) : false) ||
    (i.targetOverlayId ? excludedIds.has(i.targetOverlayId) : false) ||
    (i.targetStateId ? excludedIds.has(i.targetStateId) : false)

  const interactions = pkg.interactionGraph.interactions.filter(i => !refsExcluded(i))

  // 4. 重算 interactionGraph 统计
  const highConfidenceCount = interactions.filter(i => i.confidence >= 0.85).length
  const mediumConfidenceCount = interactions.filter(i => i.confidence >= 0.6 && i.confidence < 0.85).length
  const lowConfidenceCount = interactions.filter(i => i.confidence < 0.6).length
  const userConfirmedCount = interactions.filter(i => i.confirmedByUser).length

  return {
    ...pkg,
    pageList: { pages },
    assets,
    interactionGraph: {
      ...pkg.interactionGraph,
      interactions,
      totalInteractions: interactions.length,
      highConfidenceCount,
      mediumConfidenceCount,
      lowConfidenceCount,
      userConfirmedCount,
    },
  }
}
