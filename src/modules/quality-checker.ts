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

  // 5. HTML 缺失(不阻断,仅提示)
  const missingHTML = pkg.pageList.pages.filter(p => p.htmlStatus === 'unavailable' || p.htmlStatus === 'failed')
  if (missingHTML.length > 0) {
    checks.hasMissingHTML = true
    issues.push({
      id: 'missing_html',
      severity: 'info',
      category: '数据采集',
      title: `${missingHTML.length} 个页面 HTML 缺失`,
      detail: 'HTML / D2C 不可用,外部 AI 将基于 DSL + 截图生成代码。',
      suggestion: '如需 HTML 参考,建议在 DevMode 下重新导出。',
    })
  }

  // 6. 截图缺失
  const missingScreenshot = pkg.pageList.pages.filter(p => p.screenshotStatus === 'failed' || p.screenshotStatus === 'unavailable')
  if (missingScreenshot.length > 0) {
    checks.hasMissingScreenshot = true
    issues.push({
      id: 'missing_screenshot',
      severity: 'blocking',
      category: '数据采集',
      title: `${missingScreenshot.length} 个页面截图缺失`,
      detail: missingScreenshot.map(p => p.pageName).join('; '),
      suggestion: '截图是外部 AI 理解视觉效果的关键,建议重新导出这些页面。',
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
    if (!i.target) return false
    return !pkg.pageList.pages.some(p => p.pageId === i.target)
  })
  if (brokenLinks.length > 0) {
    checks.hasTargetPageNotFound = true
    issues.push({
      id: 'broken_links',
      severity: 'blocking',
      category: '关系完整性',
      title: `${brokenLinks.length} 条关系的目标页面不存在`,
      detail: brokenLinks.map(i => `${i.fromPage} → ${i.target}`).join('; '),
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

  // 15. Prompt 过长(估算 token 数,>50k 提示)
  const estimatedTokens = estimatePromptTokens(pkg)
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

  // 16. 数据包过大(ZIP 估算 >50MB 提示)
  const estimatedSize = estimatePackageSize(pkg)
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

  // 未解决问题(来自 InteractionGraph)
  const unresolvedQuestions = pkg.interactionGraph.unresolvedQuestions.map(q => ({
    question: q.question,
    relatedPage: q.relatedPage,
    relatedElement: q.relatedElement,
    suggestedOptions: q.suggestedOptions,
  }))

  // 建议
  const suggestions: string[] = []
  if (blockingIssues.length > 0) suggestions.push('存在阻断性问题,建议优先解决后再导出数据包。')
  if (warnings.length > 5) suggestions.push('建议逐条检查警告项,提升数据包质量。')
  if (unresolvedQuestions.length > 0) suggestions.push(`存在 ${unresolvedQuestions.length} 个待确认问题,建议在页面流程确认页逐条处理。`)

  return {
    score,
    checks,
    blockingIssues,
    warnings,
    unresolvedQuestions,
    suggestions,
    generatedAt: Date.now(),
    totalIssues: issues.length,
  }
}

// ========== 估算 token 数(简化版:按字符 / 3) ==========
function estimatePromptTokens(pkg: AIContextPackage): number {
  const jsonStr = JSON.stringify(pkg)
  return Math.ceil(jsonStr.length / 3)
}

// ========== 估算数据包大小(JSON + 截图) ==========
function estimatePackageSize(pkg: AIContextPackage): number {
  const jsonSize = JSON.stringify(pkg).length
  const screenshotCount = pkg.pageList.pages.filter(p => p.screenshotStatus === 'success').length
  const avgScreenshotSize = 150 * 1024 // 假设每张截图 150KB
  return jsonSize + screenshotCount * avgScreenshotSize
}
