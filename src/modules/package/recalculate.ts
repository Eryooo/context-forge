// ============================================================
// R3-S4: recalculatePackage — 用户编辑后完整重算数据包
// 审计 P0-7:替换旧 recalculatePackageAfterUserEdit。
// 支持页面/关系/PRD 任一变化,完整重建 pageGraph(用 rebuildPageGraph),
// 重算 interactionGraph / qualityReport / collectionStats。
// 禁止只局部更新 pageGroups。
// ============================================================

import type { AIContextPackage } from '@schema/package-schema'
import type { Interaction } from '@schema/interaction'
import type { PageNode } from '@schema/page-graph'
import type { PRDContext } from '@schema/package-schema'
import { runQualityChecks } from '../quality-checker'
import { generateUnresolvedQuestions } from '../relation-inference'
import { rebuildPageGraph } from '../page-graph/rebuild'

export interface RecalculateInput {
  pages?: PageNode[]              // 页面变化(改类型/重命名/入口页/排除)
  interactions?: Interaction[]    // 关系变化(确认/删除/修改/新增)
  prdContext?: PRDContext | null  // PRD 变化
  dismissQuestionId?: string      // R3.1-3:用户"无需处理"的问题 id,加入 dismissedQuestionIds
}

/**
 * 用户编辑后完整重算数据包(纯函数,不修改入参)。
 *
 * @param pkg 当前数据包
 * @param input 变化的部分(pages / interactions / prdContext 任一或多个)
 * @returns 完整重算后的新数据包
 *
 * 重算内容:
 * - pageList(若 pages 变化)
 * - prdContext(若 prdContext 变化)
 * - pageGraph(完整重建,经 rebuildPageGraph)
 * - interactionGraph(counts + unresolvedQuestions)
 * - collectionStats.interactionsConfirmed
 * - qualityReport(重新全检)
 */
export function recalculatePackage(
  pkg: AIContextPackage,
  input: RecalculateInput
): AIContextPackage {
  // 1. 解析最新的 pages / interactions / prd(变化的用新值,未变的用原值)
  const pages = input.pages ?? pkg.pageList.pages
  const interactions = input.interactions ?? pkg.interactionGraph.interactions
  const prdContext = input.prdContext !== undefined ? (input.prdContext ?? undefined) : pkg.prdContext

  // 2. 完整重建 pageGraph(P0-7:不再只更新 pageGroups)
  const newPageGraph = rebuildPageGraph(pages, interactions)

  // 3. 重算 interactionGraph counts
  const totalInteractions = interactions.length
  const highConfidenceCount = interactions.filter(i => i.confidence >= 0.85).length
  const mediumConfidenceCount = interactions.filter(i => i.confidence >= 0.6 && i.confidence < 0.85).length
  const lowConfidenceCount = interactions.filter(i => i.confidence < 0.6).length
  const userConfirmedCount = interactions.filter(i => i.confirmedByUser).length

  // 4. 重新生成规则层 unresolvedQuestions(低置信度/无目标的关系)
  const ruleQuestions = generateUnresolvedQuestions(interactions, pages)

  // R3.1-3:维护 dismissedQuestionIds(并入用户本次"无需处理"的 id)
  const dismissedQuestionIds = Array.from(new Set([
    ...(pkg.interactionGraph.dismissedQuestionIds || []),
    ...(input.dismissQuestionId ? [input.dismissQuestionId] : []),
  ]))

  const newInteractionGraph = {
    ...pkg.interactionGraph,
    interactions,
    totalInteractions,
    highConfidenceCount,
    mediumConfidenceCount,
    lowConfidenceCount,
    userConfirmedCount,
    unresolvedQuestions: ruleQuestions,
    dismissedQuestionIds,
  }

  // 5. collectionStats
  const newCollectionStats = {
    ...pkg.collectionStats,
    interactionsConfirmed: userConfirmedCount,
  }

  // 6. 组装待检查的 pkg
  const pkgToCheck: AIContextPackage = {
    ...pkg,
    pageList: { pages },
    prdContext,
    pageGraph: newPageGraph,
    interactionGraph: newInteractionGraph,
    collectionStats: newCollectionStats,
  }

  // 7. 运行质量检查(S8 后为纯函数,返回的 qualityReport.unresolvedQuestions
  //    含质量层生成的问题,如 zero-interaction)
  const newQualityReport = runQualityChecks(pkgToCheck)

  // 8. R3-S8:由 recalculate 显式 merge 质量层问题到 interactionGraph.unresolvedQuestions
  //    (quality-checker 不再直接 push 修改 pkg)
  // R3.1-3:过滤掉已 dismiss 的问题
  const mergedQuestions = mergeUnresolvedQuestions(
    ruleQuestions,
    newQualityReport.unresolvedQuestions
  ).filter(q => !dismissedQuestionIds.includes(q.id))

  return {
    ...pkgToCheck,
    interactionGraph: {
      ...newInteractionGraph,
      unresolvedQuestions: mergedQuestions,
    },
    qualityReport: newQualityReport,
  }
}

/**
 * 合并规则层 + 质量层的 unresolvedQuestions,按 id 去重。
 * 规则层优先(用户处理关系时直接操作的就是规则层问题)。
 */
function mergeUnresolvedQuestions(
  ruleQuestions: AIContextPackage['interactionGraph']['unresolvedQuestions'],
  qualityQuestions: AIContextPackage['qualityReport']['unresolvedQuestions']
): AIContextPackage['interactionGraph']['unresolvedQuestions'] {
  const seen = new Set(ruleQuestions.map(q => q.id))
  const merged = [...ruleQuestions]
  for (const q of qualityQuestions) {
    // qualityReport.unresolvedQuestions 结构可能与 interactionGraph 的略不同,做兼容映射
    const id = (q as any).id || (q as any).question
    if (!seen.has(id)) {
      seen.add(id)
      merged.push({
        id,
        question: q.question,
        relatedPage: (q as any).relatedPage,
        relatedElement: (q as any).relatedElement,
        suggestedOptions: q.suggestedOptions || [],
      })
    }
  }
  return merged
}

/**
 * @deprecated R3-S4 起改用 recalculatePackage(pkg, input)。
 * 保留旧函数名做兼容,内部转发。
 */
export function recalculatePackageAfterUserEdit(
  pkg: AIContextPackage,
  updatedInteractions: Interaction[]
): AIContextPackage {
  return recalculatePackage(pkg, { interactions: updatedInteractions })
}
