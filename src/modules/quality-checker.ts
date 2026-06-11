// ============================================================
// 质量检查模块 — 16 项检查(PRD §14)+ 评分 + 问题收集
// ============================================================

import type { QualityReport, QualityIssue, IssueSeverity } from '../schema/quality-report'
import type { PageNode, PageList, PageGraph } from '../schema/page-graph'
import type { InteractionGraph, Interaction } from '../schema/interaction'
import type { AIContextPackage } from '../schema/package-schema'
import { calculateQualityScore } from '../schema/quality-report'

// ========== 16 项检查 ==========

export function runQualityChecks(pkg: AIContextPackage): QualityReport {
  const issues: QualityIssue[] = []
  const checks = {
    hasUnnamedPages: false,
    hasDuplicatePageNames: false,
    hasUnclassifiedPages: false,
    hasMissingDSL: false,
    hasMissingHTML: false,
    hasMissingScreenshot: false,
    hasUnconfirmedHighRiskRelations: false,
    hasTargetPageNotFound: false,
    hasModalWithoutClose: false,
    hasDetailWithoutBack: false,
    hasFormWithoutSuccessState: false,
    hasFormWithoutFailureState: false,
    hasEntryPageMissing: false,
    hasPRDMissing: false,
    hasPromptTooLong: false,
    hasPackageTooLarge: false,
  }

  // 1. 未命名页面
  const unnamedPages = pkg.pageList.pages.filter(p => !p.pageName || p.pageName.trim() === '')
  if (unnamedPages.length > 0) {
    checks.hasUnnamedPages = true
    issues.push({
      id: 'unnamed_pages',
      severity: 'warning',
      category: '页面命名',
      title: `存在 ${unnamedPages.length} 个未命名页面`,
      detail: unnamedPages.map(p => `页面 ID: ${p.pageId}`).join('; '),
      suggestion: '建议为所有页面添加有意义的名称,便于理解页面用途。',
    })
  }

  // 2. 重复页面名
  const nameMap = new Map<string, number>()
  pkg.pageList.pages.forEach(p => {
    const count = nameMap.get(p.pageName) || 0
    nameMap.set(p.pageName, count + 1)
  })
  const duplicates = Array.from(nameMap.entries()).filter(([_, count]) => count > 1)
  if (duplicates.length > 0) {
    checks.hasDuplicatePageNames = true
    issues.push({
      id: 'duplicate_names',
      severity: 'warning',
      category: '页面命名',
      title: `存在 ${duplicates.length} 组重复页面名`,
      detail: duplicates.map(([name, count]) => `${name}(${count} 个)`).join('; '),
      suggestion: '建议为重复名称添加前缀或后缀区分,如"任务列表-移动端"、"任务列表-PC 端"。',
    })
  }

  // 3. 未归属页面
  if (pkg.pageGraph.unclassified.length > 0) {
    checks.hasUnclassifiedPages = true
    issues.push({
      id: 'unclassified_pages',
      severity: 'info',
      category: '页面识别',
      title: `存在 ${pkg.pageGraph.unclassified.length} 个未归属页面`,
      detail: '这些页面识别出来但不知道挂在哪个主流程下。',
      suggestion: '可在页面流程确认页手动归属,或补充页面命名规则。',
    })
  }

  // 4. DSL 缺失
  const missingDSL = pkg.pageList.pages.filter(p => p.dslStatus === 'failed' || p.dslStatus === 'unavailable')
  if (missingDSL.length > 0) {
    checks.hasMissingDSL = true
    issues.push({
      id: 'missing_dsl',
      severity: 'warning',
      category: '数据采集',
      title: `${missingDSL.length} 个页面 DSL 缺失`,
      detail: missingDSL.map(p => p.pageName).join('; '),
      suggestion: 'DSL 缺失会影响外部 AI 理解页面结构,建议检查这些页面是否过大或命名不规范。',
    })
  }

  // 5. HTML 缺失(审计 14.2:分级)
  const missingHTML = pkg.pageList.pages.filter(p => p.htmlStatus === 'unavailable' || p.htmlStatus === 'failed')
  if (missingHTML.length > 0) {
    checks.hasMissingHTML = true
    // HTML缺失但DSL+screenshot在→info;screenshot也缺→warning
    const alsoMissingScreenshot = missingHTML.filter(p => p.screenshotStatus !== 'success')
    issues.push({
      id: 'missing_html',
      severity: alsoMissingScreenshot.length > 0 ? 'warning' : 'info',
      category: '数据采集',
      title: `${missingHTML.length} 个页面 HTML 缺失`,
      detail: alsoMissingScreenshot.length > 0
        ? `其中 ${alsoMissingScreenshot.length} 个页面截图也缺失,外部 AI 仅能参考 DSL。`
        : 'HTML / D2C 不可用,外部 AI 将基于 DSL + 截图生成代码。',
      suggestion: alsoMissingScreenshot.length > 0
        ? '建议重新导出截图缺失的页面,或在 DevMode 下获取 HTML。'
        : '如需 HTML 参考,建议在 DevMode 下重新导出。',
    })
  }

  // 6. 截图缺失(审计 14.1:条件 blocking)
  const missingScreenshot = pkg.pageList.pages.filter(p => p.screenshotStatus === 'failed' || p.screenshotStatus === 'unavailable')
  if (missingScreenshot.length > 0) {
    checks.hasMissingScreenshot = true
    // 条件 blocking:如果 DSL 或 HTML 存在,降为 warning;如果三者全缺,blocking
    const hasOtherData = missingScreenshot.every(p => p.dslStatus === 'success' || p.htmlStatus === 'success')
    issues.push({
      id: 'missing_screenshot',
      severity: hasOtherData ? 'warning' : 'blocking',
      category: '数据采集',
      title: `${missingScreenshot.length} 个页面截图缺失`,
      detail: missingScreenshot.map(p => p.pageName).join('; '),
      suggestion: hasOtherData
        ? '截图缺失,但 DSL/HTML 存在。外部 AI 仍可参考结构,但视觉还原度会下降。'
        : '截图/DSL/HTML 全缺失,外部 AI 无法生成这些页面。建议重新导出。',
    })
  }

  // 7. 未确认高风险关系(低置信度且未确认)
  const highRisk = pkg.interactionGraph.interactions.filter(i => i.confidence < 0.6 && !i.confirmedByUser)
  if (highRisk.length > 0) {
    checks.hasUnconfirmedHighRiskRelations = true
    issues.push({
      id: 'high_risk_relations',
      severity: 'warning',
      category: '关系完整性',
      title: `${highRisk.length} 条关系置信度低且未确认`,
      detail: '这些关系可能推断错误,建议在页面流程确认页逐条检查。',
      suggestion: '可批量删除明显错误的关系,或手动修正目标页面。',
    })
  }

  // 8. 目标页面不存在
  const brokenLinks = pkg.interactionGraph.interactions.filter(i => {
    const targetId = i.targetPageId || i.targetOverlayId || i.targetStateId
    if (!targetId) return false
    return !pkg.pageList.pages.some(p => p.pageId === targetId)
  })
  if (brokenLinks.length > 0) {
    checks.hasTargetPageNotFound = true
    issues.push({
      id: 'broken_links',
      severity: 'blocking',
      category: '关系完整性',
      title: `${brokenLinks.length} 条关系的目标页面不存在`,
      detail: brokenLinks.map(i => `${i.fromPage} → ${i.targetPageId || i.targetOverlayId || i.targetStateId}`).join('; '),
      suggestion: '这些关系的目标 ID 无效,请删除或修正。',
    })
  }

  // 9. 弹窗无关闭路径
  const modalsWithoutClose = pkg.pageList.pages.filter(p => {
    if (p.pageType !== 'modal' && p.pageType !== 'drawer') return false
    const closeActions = pkg.interactionGraph.interactions.filter(i =>
      i.fromPage === p.pageId && (i.actionType === 'closeModal' || i.actionType === 'closeDrawer')
    )
    return closeActions.length === 0
  })
  if (modalsWithoutClose.length > 0) {
    checks.hasModalWithoutClose = true
    issues.push({
      id: 'modal_without_close',
      severity: 'warning',
      category: '关系完整性',
      title: `${modalsWithoutClose.length} 个弹窗/抽屉缺少关闭路径`,
      detail: modalsWithoutClose.map(p => p.pageName).join('; '),
      suggestion: '建议为每个弹窗/抽屉添加关闭按钮或返回逻辑。',
    })
  }

  // 10. 详情页无返回路径
  const detailsWithoutBack = pkg.pageList.pages.filter(p => {
    if (p.pageType !== 'detail') return false
    const backActions = pkg.interactionGraph.interactions.filter(i =>
      i.fromPage === p.pageId && i.actionType === 'goBack'
    )
    return backActions.length === 0
  })
  if (detailsWithoutBack.length > 0) {
    checks.hasDetailWithoutBack = true
    issues.push({
      id: 'detail_without_back',
      severity: 'warning',
      category: '关系完整性',
      title: `${detailsWithoutBack.length} 个详情页缺少返回路径`,
      detail: detailsWithoutBack.map(p => p.pageName).join('; '),
      suggestion: '建议为详情页添加返回按钮或面包屑导航。',
    })
  }

  // 11. 表单提交无成功状态
  const formsWithoutSuccess = pkg.pageList.pages.filter(p => {
    if (p.pageType !== 'form') return false
    const submitActions = pkg.interactionGraph.interactions.filter(i =>
      i.fromPage === p.pageId && i.actionType === 'submitForm'
    )
    if (submitActions.length === 0) return false
    const hasSuccess = submitActions.some(i => i.expectedState?.includes('成功') || i.expectedState?.includes('success'))
    return !hasSuccess
  })
  if (formsWithoutSuccess.length > 0) {
    checks.hasFormWithoutSuccessState = true
    issues.push({
      id: 'form_without_success',
      severity: 'warning',
      category: '关系完整性',
      title: `${formsWithoutSuccess.length} 个表单缺少提交成功状态`,
      detail: formsWithoutSuccess.map(p => p.pageName).join('; '),
      suggestion: '建议为表单补充提交成功后的 Toast / 跳转 / 成功状态页。',
    })
  }

  // 12. 表单提交无失败状态
  const formsWithoutFailure = pkg.pageList.pages.filter(p => {
    if (p.pageType !== 'form') return false
    const submitActions = pkg.interactionGraph.interactions.filter(i =>
      i.fromPage === p.pageId && i.actionType === 'submitForm'
    )
    if (submitActions.length === 0) return false
    const hasFailure = submitActions.some(i => i.failureState)
    return !hasFailure
  })
  if (formsWithoutFailure.length > 0) {
    checks.hasFormWithoutFailureState = true
    issues.push({
      id: 'form_without_failure',
      severity: 'info',
      category: '关系完整性',
      title: `${formsWithoutFailure.length} 个表单缺少提交失败状态`,
      detail: formsWithoutFailure.map(p => p.pageName).join('; '),
      suggestion: '建议补充提交失败的错误提示或错误状态页。',
    })
  }

  // 13. 主流程入口缺失
  if (!pkg.pageGraph.entryPage) {
    checks.hasEntryPageMissing = true
    issues.push({
      id: 'entry_missing',
      severity: 'blocking',
      category: '页面流程',
      title: '主流程入口页面缺失',
      detail: '未识别出入口页(登录/启动/首页)。',
      suggestion: '建议手动指定一个入口页,或为入口页添加明确命名。',
    })
  }

  // 审计 A12 / 14.3(P0):页面>1 且交互=0 不可高分,强制扣分并生成 unresolvedQuestion
  // R3-S8:纯函数化 —— 不再 push 修改 pkg,改用本地数组收集质量层问题
  const qualityQuestions: Array<{ id: string; question: string; relatedPage: string | undefined; relatedElement: string | undefined; suggestedOptions: string[] }> = []
  const pageCount = pkg.pageList.pages.filter(p => p.pageType !== 'component' && p.pageType !== 'unknown').length
  const interactionCount = pkg.interactionGraph.totalInteractions
  if (pageCount > 1 && interactionCount === 0) {
    issues.push({
      id: 'zero_interactions',
      severity: 'blocking',
      category: '关系完整性',
      title: `${pageCount} 个页面但无交互关系`,
      detail: '设计稿包含多个页面,但插件未识别出任何页面关系(跳转/弹窗/状态)。',
      suggestion: '① 检查设计稿是否有原型连线(reactions);② 检查按钮/链接命名是否包含"新增/编辑/查看/返回"等关键词;③ 在页面流程确认页手动补充主流程。',
    })
    // R3-S8:输出到本地数组,不直接修改 pkg(由 recalculatePackage 显式 merge 回 interactionGraph)
    qualityQuestions.push({
      id: 'q_zero_inter',
      question: `当前设计稿有 ${pageCount} 个页面,但未识别出任何关系。请补充:① 主页面入口;② 页面间如何跳转;③ 是否有弹窗/抽屉。`,
      relatedPage: undefined,
      relatedElement: undefined,
      suggestedOptions: ['手动补充主流程', '添加原型连线后重新生成', '当前为单页应用(无需关系)'],
    })
  }

  // 14. PRD 缺失
  if (!pkg.prdContext || !pkg.prdContext.summary) {
    checks.hasPRDMissing = true
    issues.push({
      id: 'prd_missing',
      severity: 'info',
      category: 'PRD 上下文',
      title: 'PRD 上下文未补充',
      detail: '未填写 PRD 摘要、业务规则、用户故事等。',
      suggestion: '补充 PRD 可大幅提升外部 AI 生成代码的准确性。',
    })
  }

  // 15. Prompt 过长(R3-S10:剥离 assets.base64 后再估,避免误报)
  // 构造不含 base64 的精简对象估算(Prompt 实际不内嵌 base64)
  const pkgWithoutAssets = { ...pkg, assets: undefined }
  const estimatedTokens = estimatePromptTokens(JSON.stringify(pkgWithoutAssets))
  if (estimatedTokens > 50000) {
    checks.hasPromptTooLong = true
    issues.push({
      id: 'prompt_too_long',
      severity: 'warning',
      category: '数据包大小',
      title: `Prompt 估算 token 数 ${estimatedTokens},超过 50k`,
      detail: '过长 Prompt 可能超出部分 AI 模型上下文限制。',
      suggestion: '建议启用 AI Prompt 压缩,或采用分包模式。',
    })
  }

  // 16. 数据包过大(R3-S10:JSON 本体 + 资产分开评估)
  const estimatedSize = estimateJsonPackageSize(pkg) + estimateAssetSize(pkg.assets)
  if (estimatedSize > 50 * 1024 * 1024) {
    checks.hasPackageTooLarge = true
    issues.push({
      id: 'package_too_large',
      severity: 'warning',
      category: '数据包大小',
      title: `数据包估算大小 ${(estimatedSize / 1024 / 1024).toFixed(1)} MB,超过 50MB`,
      detail: '过大数据包传输慢,且可能超出某些工具限制。',
      suggestion: '建议减少截图数量、启用截图压缩、或采用分包模式。',
    })
  }

  // 分类问题
  const blockingIssues = issues.filter(i => i.severity === 'blocking')
  const warnings = issues.filter(i => i.severity === 'warning')

  // 评分
  const score = calculateQualityScore(checks, issues)

  // 未解决问题:已有的(来自 interactionGraph)+ 质量层新生成的(去重)
  // R3-S8:纯函数 —— 只读 pkg,不修改;返回合并结果供 recalculate 决定如何回写
  const existing = pkg.interactionGraph.unresolvedQuestions.map(q => ({
    id: q.id,
    question: q.question,
    relatedPage: q.relatedPage,
    relatedElement: q.relatedElement,
    suggestedOptions: q.suggestedOptions,
  }))
  const seenIds = new Set(existing.map(q => q.id))
  const merged = [...existing]
  for (const q of qualityQuestions) {
    if (!seenIds.has(q.id)) {
      seenIds.add(q.id)
      merged.push(q)
    }
  }
  const unresolvedQuestions = merged

  // 建议
  const suggestions: string[] = []
  if (blockingIssues.length > 0) suggestions.push('存在阻断性问题,建议优先解决后再导出数据包。')
  if (warnings.length > 5) suggestions.push('建议逐条检查警告项,提升数据包质量。')
  if (unresolvedQuestions.length > 0) suggestions.push(`存在 ${unresolvedQuestions.length} 个待确认问题,建议在页面流程确认页逐条处理。`)

  // R3-S13:分项评分(0–100)
  const allPages = pkg.pageList.pages
  const realPages = allPages.filter(p => p.pageType !== 'component' && p.pageType !== 'unknown' && !p.excluded)

  // 数据完整度:DSL/HTML/截图 成功率
  const dataScore = realPages.length === 0 ? 100 : Math.round(
    realPages.reduce((acc, p) => {
      let s = 0
      if (p.dslStatus === 'success') s += 1
      else if (p.dslStatus === 'fallback') s += 0.6
      if (p.screenshotStatus === 'success') s += 1
      if (p.htmlStatus === 'success') s += 0.5
      return acc + s / 2.5
    }, 0) / realPages.length * 100
  )

  // 页面确认度:userConfirmed 比例 + 是否有入口页
  const confirmedPages = allPages.filter(p => p.userConfirmed || p.isEntryPage).length
  const hasEntry = !!pkg.pageGraph.entryPage
  const pageConfScore = Math.round(
    (allPages.length === 0 ? 0 : confirmedPages / allPages.length * 70) + (hasEntry ? 30 : 0)
  )

  // 交互完整度:页面>1 且交互=0 → 极低分
  let interactionScore: number
  if (pageCount > 1 && interactionCount === 0) {
    interactionScore = 10
  } else if (interactionCount === 0) {
    interactionScore = 60 // 单页应用,无关系正常
  } else {
    const confirmedRate = pkg.interactionGraph.userConfirmedCount / interactionCount
    interactionScore = Math.round(50 + confirmedRate * 50)
  }

  // PRD 完整度
  const prdScore = !pkg.prdContext ? 0 : Math.round(
    (pkg.prdContext.summary ? 40 : 0) +
    ((pkg.prdContext.businessRules?.length || 0) > 0 ? 30 : 0) +
    ((pkg.prdContext.acceptanceCriteria?.length || 0) > 0 ? 30 : 0)
  )

  // 导出可用性:blocking 越多越低
  const exportScore = Math.max(0, 100 - blockingIssues.length * 34)

  const dimensions = {
    dataCompleteness: dataScore,
    pageConfirmation: pageConfScore,
    interactionCompleteness: interactionScore,
    prdCompleteness: prdScore,
    exportReadiness: exportScore,
  }

  return {
    score,
    dimensions,
    checks,
    blockingIssues,
    warnings,
    unresolvedQuestions,
    suggestions,
    generatedAt: Date.now(),
    totalIssues: issues.length,
  }
}

// ========== R3-S10:体积评估(拆分,不用含 base64 的 JSON 估 Prompt)==========

// 估算 Prompt token 数(基于真实 Prompt 文本,不含 base64)
export function estimatePromptTokens(prompt: string): number {
  // 粗略:中英文混合按 字符数/2.5 估 token
  return Math.ceil(prompt.length / 2.5)
}

// 估算 JSON 数据包大小(含 assets,字节)
export function estimateJsonPackageSize(pkg: AIContextPackage): number {
  return JSON.stringify(pkg).length
}

// 估算资产大小(仅 base64 截图,字节)
export function estimateAssetSize(assets: AIContextPackage['assets']): number {
  if (!assets || !assets.pages) return 0
  let total = 0
  for (const pageId of Object.keys(assets.pages)) {
    const b64 = assets.pages[pageId]?.screenshotBase64
    if (b64) {
      // base64 解码后约为 length * 3/4 字节
      total += Math.ceil((b64.length * 3) / 4)
    }
  }
  return total
}
