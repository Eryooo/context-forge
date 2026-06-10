// ============================================================
// 用户编辑后质量重算(审计 P0 / 8.4)
// 用户确认/删除/修改关系、改页面类型/排除页面/改入口页后,必须重算:
// - interactionGraph 的 counts
// - unresolvedQuestions
// - pageGraph.pageGroups(挂载关系)
// - qualityReport
// - collectionStats.interactionsConfirmed
// ============================================================

import type { AIContextPackage } from '@schema/package-schema'
import type { Interaction } from '@schema/interaction'
import { runQualityChecks } from '../quality-checker'
import { generateUnresolvedQuestions } from '../relation-inference'

/**
 * 用户编辑后重算数据包(P0)。
 * 入参: pkg(当前数据包), updatedInteractions(用户编辑后的新 interactions)。
 * 返回: 更新后的完整数据包(不修改原 pkg)。
 *
 * 必须重算的内容:
 * - interactionGraph.interactions / totalInteractions / high/medium/low/userConfirmed count
 * - interactionGraph.unresolvedQuestions
 * - pageGraph.pageGroups(挂载关系受交互影响)
 * - qualityReport(重新运行全检)
 * - collectionStats.interactionsConfirmed
 */
export function recalculatePackageAfterUserEdit(
  pkg: AIContextPackage,
  updatedInteractions: Interaction[]
): AIContextPackage {
  // 重算 interactionGraph counts
  const totalInteractions = updatedInteractions.length
  const highConfidenceCount = updatedInteractions.filter(i => i.confidence >= 0.85).length
  const mediumConfidenceCount = updatedInteractions.filter(i => i.confidence >= 0.6 && i.confidence < 0.85).length
  const lowConfidenceCount = updatedInteractions.filter(i => i.confidence < 0.6).length
  const userConfirmedCount = updatedInteractions.filter(i => i.confirmedByUser).length

  // 重新生成 unresolvedQuestions(低置信度且无目标的关系)
  const unresolvedQuestions = generateUnresolvedQuestions(updatedInteractions, pkg.pageList.pages)

  // 更新 interactionGraph
  const newInteractionGraph = {
    ...pkg.interactionGraph,
    interactions: updatedInteractions,
    totalInteractions,
    highConfidenceCount,
    mediumConfidenceCount,
    lowConfidenceCount,
    userConfirmedCount,
    unresolvedQuestions,
  }

  // 重新计算 pageGraph.pageGroups(挂载关系)
  // 挂载逻辑:主页面 → overlay/state 的 openModal/showState 关系
  const pageGroups = pkg.pageGraph.pageGroups.map(group => {
    const basePage = group.basePage
    const relatedOverlays = updatedInteractions
      .filter(i =>
        i.fromPage === basePage &&
        (i.actionType === 'openModal' || i.actionType === 'openDrawer') &&
        i.targetOverlayId
      )
      .map(i => i.targetOverlayId!)
    const relatedStates = updatedInteractions
      .filter(i =>
        i.fromPage === basePage &&
        i.interactionType === 'state' &&
        i.targetStateId
      )
      .map(i => i.targetStateId!)
    const children = [
      ...relatedOverlays.map(oid => ({ pageId: oid, relationType: 'overlay' as const })),
      ...relatedStates.map(sid => ({ pageId: sid, relationType: 'state' as const })),
    ]
    return { ...group, children }
  })

  const newPageGraph = { ...pkg.pageGraph, pageGroups }

  // 更新 collectionStats.interactionsConfirmed
  const newCollectionStats = {
    ...pkg.collectionStats,
    interactionsConfirmed: userConfirmedCount,
  }

  // 构建新数据包(用于质量检查)
  const pkgToCheck: AIContextPackage = {
    ...pkg,
    interactionGraph: newInteractionGraph,
    pageGraph: newPageGraph,
    collectionStats: newCollectionStats,
  }

  // 重新运行质量检查(P0:用户编辑后评分必须更新)
  const newQualityReport = runQualityChecks(pkgToCheck)

  return {
    ...pkgToCheck,
    qualityReport: newQualityReport,
  }
}
