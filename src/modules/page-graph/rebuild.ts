// ============================================================
// R3-S3: rebuildPageGraph — 页面/关系编辑后完整重建 PageGraph
// 审计 P0-7:原 recalculate 只更新 pageGroups,不重建
// entryPage/mainFlow/各 count,导致用户改页面类型后 pageGraph 不一致。
//
// 规则(R3-S2):
// - excluded 页面不进入 mainFlow / pageGroups / 不作为 interaction target
// - isEntryPage 优先于自动 identifyEntryPage
// ============================================================

import type { PageNode, PageGraph, PageGroup } from '../../schema/page-graph'
import type { Interaction } from '../../schema/interaction'
import { identifyEntryPage } from '../page-identifier'

/**
 * 从页面列表 + 交互关系完整重建 PageGraph。
 * 纯函数:不修改入参。
 *
 * @param pages 当前页面列表(含用户编辑后的类型/isEntryPage/excluded)
 * @param interactions 当前交互关系
 * @returns 重建后的 PageGraph
 */
export function rebuildPageGraph(pages: PageNode[], interactions: Interaction[]): PageGraph {
  // 1. 过滤掉 excluded 页面(不进入任何图谱结构)
  const activePages = pages.filter(p => !p.excluded)

  // 2. 分类
  const mainPages = activePages.filter(p =>
    !p.pageType.startsWith('state_') &&
    p.pageType !== 'modal' &&
    p.pageType !== 'drawer' &&
    p.pageType !== 'component'
  )
  const overlays = activePages.filter(p => p.pageType === 'modal' || p.pageType === 'drawer')
  const states = activePages.filter(p => p.pageType.startsWith('state_'))
  const unknowns = activePages.filter(p => p.pageType === 'unknown' || p.pageType === 'component')

  // 有效页面 ID 集合(用于过滤指向已排除页面的关系 target)
  const activeIds = new Set(activePages.map(p => p.pageId))

  // 3. 构建分组:每个主页面一组,关联浮层/状态挂下面
  const pageGroups: PageGroup[] = []
  for (const main of mainPages) {
    const group: PageGroup = { basePage: main.pageId, children: [] }

    // 挂在该页面下的浮层(target 必须是有效页面)
    interactions
      .filter(i =>
        i.fromPage === main.pageId &&
        (i.actionType === 'openModal' || i.actionType === 'openDrawer') &&
        i.targetOverlayId &&
        activeIds.has(i.targetOverlayId)
      )
      .forEach(i => group.children.push({ pageId: i.targetOverlayId!, relationType: 'overlay' }))

    // 挂在该页面下的状态页(target 必须是有效页面)
    interactions
      .filter(i =>
        i.fromPage === main.pageId &&
        i.interactionType === 'state' &&
        i.targetStateId &&
        activeIds.has(i.targetStateId)
      )
      .forEach(i => group.children.push({ pageId: i.targetStateId!, relationType: 'state' }))

    pageGroups.push(group)
  }

  // 4. 入口页:用户手动指定优先于自动识别(R3-S2)
  const userEntry = activePages.find(p => p.isEntryPage)
  const entryPageId = userEntry ? userEntry.pageId : identifyEntryPage(activePages)

  // 5. 主流程:主页面顺序,入口页置顶
  const mainFlow = mainPages.map(p => p.pageId)
  if (entryPageId && mainFlow.includes(entryPageId)) {
    mainFlow.splice(mainFlow.indexOf(entryPageId), 1)
    mainFlow.unshift(entryPageId)
  }

  return {
    entryPage: entryPageId,
    mainFlow,
    pageGroups,
    unclassified: unknowns.map(p => p.pageId),
    totalPages: activePages.length,
    mainPageCount: mainPages.length,
    overlayCount: overlays.length,
    stateCount: states.length,
    unknownCount: unknowns.length,
  }
}
