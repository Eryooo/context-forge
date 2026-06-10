// ============================================================
// 导出模块 — Prompt / JSON / Markdown 生成
// Step 7 核心逻辑,PRD §12 定义的 Prompt 结构。
// 安全:所有导出入口先调 sanitizePackageForExport(审计 P0)。
// ============================================================

import type { AIContextPackage, ExportFormat, ExportOptions } from '../schema/package-schema'
import type { PageNode } from '../schema/page-graph'
import type { Interaction } from '../schema/interaction'
import { sanitizePackageForExport, applyRawPRDPolicy } from './export/sanitize'

// ========== Prompt 生成(PRD §12.2 定义的 12 节结构) ==========

export function generatePrompt(pkg: AIContextPackage, options?: ExportOptions): string {
  // 安全:导出前脱敏(审计 P0)。Prompt 不内嵌 base64,仅说明资产位置。
  let clean = sanitizePackageForExport(pkg)
  clean = applyRawPRDPolicy(clean, options?.includeRawPRD ?? false)
  pkg = clean

  const sections: string[] = []

  // 审计 11.1:重要边界声明(置于开头,防外部 AI 误解任务)
  sections.push('# 重要边界')
  sections.push('')
  sections.push('本数据包由 **ContextForge** 插件导出。ContextForge 只负责提供 MasterGo / Figma 设计上下文,**不负责生成 HTML / React / Vue**。')
  sections.push('')
  sections.push('你的任务是**基于该数据包生成完整可运行的交互 Demo**。')
  sections.push('')

  // § 1. 任务目标
  sections.push('# 任务目标')
  sections.push('')
  sections.push(pkg.aiExecutionInstruction.outputRequirement)
  sections.push('')
  sections.push(`**生成目标**: ${pkg.aiExecutionInstruction.generationTarget}`)
  sections.push(`**技术栈**: ${pkg.aiExecutionInstruction.techStack || '自行选择'}`)
  sections.push('')

  // § 2. 数据包说明
  sections.push('# 数据包说明')
  sections.push('')
  sections.push(`本数据包由 **ContextForge** 导出,包含:`)
  sections.push(`- **${pkg.pageList.pages.length} 个页面** (主页面 ${pkg.pageGraph.mainPageCount},弹窗/抽屉 ${pkg.pageGraph.overlayCount},状态页 ${pkg.pageGraph.stateCount})`)
  sections.push(`- **${pkg.interactionGraph.totalInteractions} 条交互关系** (${pkg.interactionGraph.highConfidenceCount} 条高置信度,${pkg.interactionGraph.userConfirmedCount} 条用户已确认)`)
  sections.push(`- **质量评分**: ${pkg.qualityReport.score}/100`)
  if (pkg.aiEnhancement?.enabled) {
    sections.push(`- **AI 增强**: 已启用(${pkg.aiEnhancement.model || '未指定模型'})`)
  }
  sections.push('')

  // § 3. 页面清单
  sections.push('# 页面清单')
  sections.push('')
  sections.push('| 页面名称 | 类型 | DSL | HTML | 截图 | 摘要 |')
  sections.push('| --- | --- | --- | --- | --- | --- |')
  pkg.pageList.pages.forEach(page => {
    sections.push(
      `| ${page.pageName} | ${page.pageType} | ${statusIcon(page.dslStatus)} | ${statusIcon(page.htmlStatus)} | ${statusIcon(page.screenshotStatus)} | ${page.summary.layout} |`
    )
  })
  sections.push('')

  // § 4. 页面流程
  sections.push('# 页面流程')
  sections.push('')
  if (pkg.pageGraph.entryPage) {
    const entryPage = pkg.pageList.pages.find(p => p.pageId === pkg.pageGraph.entryPage)
    sections.push(`**入口页**: ${entryPage?.pageName || '未指定'}`)
  }
  sections.push('')
  sections.push('**主流程**:')
  pkg.pageGraph.mainFlow.forEach((pageId, idx) => {
    const page = pkg.pageList.pages.find(p => p.pageId === pageId)
    sections.push(`${idx + 1}. ${page?.pageName || pageId}`)
  })
  sections.push('')

  // § 5. 交互关系
  sections.push('# 交互关系')
  sections.push('')
  sections.push('## 高置信度关系(可直接使用)')
  const highConf = pkg.interactionGraph.interactions.filter(i => i.confidence >= 0.85)
  highConf.forEach(inter => {
    sections.push(`- ${inter.naturalLanguage}`)
  })
  sections.push('')

  sections.push('## 中置信度关系(建议核对)')
  const medConf = pkg.interactionGraph.interactions.filter(i => i.confidence >= 0.6 && i.confidence < 0.85)
  medConf.forEach(inter => {
    sections.push(`- ${inter.naturalLanguage}`)
  })
  sections.push('')

  // 审计 11.2:待确认问题 / 不确定关系(置于交互关系之后)
  if (pkg.interactionGraph.unresolvedQuestions.length > 0) {
    sections.push('# 待确认问题 / 不确定关系')
    sections.push('')
    sections.push('以下关系未被用户确认,或推断置信度较低。生成代码时请保守处理,或在代码中以 TODO 标注。')
    sections.push('')
    pkg.interactionGraph.unresolvedQuestions.forEach((q, idx) => {
      sections.push(`## 问题 ${idx + 1}: ${q.question}`)
      if (q.relatedPage) sections.push(`- **关联页面**: ${pkg.pageList.pages.find(p => p.pageId === q.relatedPage)?.pageName || q.relatedPage}`)
      if (q.relatedElement) sections.push(`- **关联元素**: ${q.relatedElement}`)
      if (q.suggestedOptions.length > 0) {
        sections.push(`- **建议选项**: ${q.suggestedOptions.join(' / ')}`)
      }
      sections.push('')
    })
  }

  // § 6. PRD 上下文
  if (pkg.prdContext && pkg.prdContext.summary) {
    sections.push('# PRD 上下文')
    sections.push('')
    sections.push('## PRD 摘要')
    sections.push(pkg.prdContext.summary)
    sections.push('')

    if (pkg.prdContext.businessRules && pkg.prdContext.businessRules.length > 0) {
      sections.push('## 业务规则')
      pkg.prdContext.businessRules.forEach(rule => sections.push(`- ${rule}`))
      sections.push('')
    }

    if (pkg.prdContext.userStories && pkg.prdContext.userStories.length > 0) {
      sections.push('## 用户故事')
      pkg.prdContext.userStories.forEach(story => sections.push(`- ${story}`))
      sections.push('')
    }

    if (pkg.prdContext.specialRules && pkg.prdContext.specialRules.length > 0) {
      sections.push('## 特殊规则')
      pkg.prdContext.specialRules.forEach(rule => sections.push(`- ${rule}`))
      sections.push('')
    }
  }

  // § 7. 页面详细说明(仅主要页面,避免过长)
  sections.push('# 页面详细说明')
  sections.push('')
  const mainPages = pkg.pageList.pages.filter(p =>
    !p.pageType.startsWith('state_') && p.pageType !== 'component' && p.pageType !== 'unknown'
  ).slice(0, 10) // 限制 10 个,避免 Prompt 过长

  mainPages.forEach(page => {
    sections.push(`## ${page.pageName}`)
    sections.push('')
    sections.push(`**类型**: ${page.pageType}`)
    sections.push(`**布局**: ${page.summary.layout}`)
    sections.push(`**主要区域**: ${page.summary.mainRegions.join(', ')}`)
    sections.push(`**关键元素**: ${page.summary.keyElements.join(', ')}`)
    sections.push(`**复杂度**: ${page.summary.complexity}`)
    sections.push('')
    if (page.dslRef) {
      sections.push(`**DSL 路径**: \`${page.dslRef}\``)
    }
    if (page.htmlRef) {
      sections.push(`**HTML 路径**: \`${page.htmlRef}\``)
    }
    if (page.screenshotRef) {
      sections.push(`**截图路径**: \`${page.screenshotRef}\``)
    }
    sections.push('')
  })

  // § 8. 降级说明
  sections.push('# 降级说明')
  sections.push('')
  const degraded = pkg.pageList.pages.filter(p =>
    p.dslStatus === 'fallback' || p.htmlStatus === 'unavailable' || p.screenshotStatus === 'failed'
  )
  if (degraded.length > 0) {
    sections.push(`以下 ${degraded.length} 个页面存在数据降级:`)
    degraded.forEach(p => {
      const reasons: string[] = []
      if (p.dslStatus === 'fallback') reasons.push('DSL 降级为节点树摘要')
      if (p.htmlStatus === 'unavailable') reasons.push('HTML 不可用')
      if (p.screenshotStatus === 'failed') reasons.push('截图缺失')
      sections.push(`- **${p.pageName}**: ${reasons.join('; ')}`)
    })
  } else {
    sections.push('所有页面数据采集完整,无降级。')
  }
  sections.push('')

  // § 9. 质量报告摘要
  sections.push('# 质量报告摘要')
  sections.push('')
  sections.push(`**评分**: ${pkg.qualityReport.score}/100`)
  sections.push(`**阻断性问题**: ${pkg.qualityReport.blockingIssues.length} 个`)
  sections.push(`**警告**: ${pkg.qualityReport.warnings.length} 个`)
  sections.push(`**未解决问题**: ${pkg.qualityReport.unresolvedQuestions.length} 个`)
  sections.push('')
  if (pkg.qualityReport.blockingIssues.length > 0) {
    sections.push('**阻断性问题**:')
    pkg.qualityReport.blockingIssues.forEach(issue => {
      sections.push(`- ${issue.title}: ${issue.detail}`)
    })
    sections.push('')
  }

  // § 10. 使用建议
  sections.push('# 使用建议')
  sections.push('')
  sections.push('1. **先阅读页面清单和主流程**,理解整体结构;')
  sections.push('2. **参考交互关系**,理解页面间跳转逻辑;')
  sections.push('3. **优先使用高置信度关系**,中置信度关系需人工核对;')
  sections.push('4. **查看每个页面的 DSL / HTML / 截图**,理解视觉效果与实现细节;')
  sections.push('5. **如存在降级,以截图为准**,DSL 为辅;')
  sections.push('6. **补充 CSS 样式和响应式布局**,数据包仅提供结构和语义;')
  sections.push('7. **生成代码后,需人工调试和优化**,数据包不保证开箱即用。')
  sections.push('')

  // 审计 11.3:资产说明(告诉外部 AI 如何读取真实资产)
  sections.push('# 资产说明')
  sections.push('')
  sections.push('如果使用 **JSON 模式**,完整 DSL / HTML / 截图 base64 位于 `assets.pages[pageId]`。')
  sections.push('')
  sections.push('如果使用 **Prompt / Markdown 模式**,请优先参考页面摘要与路径引用。')
  sections.push('')
  sections.push('如果需要**完整高保真还原**,请使用 **JSON 或 ZIP 数据包**(ZIP 模式后续版本支持)。')
  sections.push('')

  // § 11. 禁止事项(PRD §12.3)
  sections.push('# 禁止事项')
  sections.push('')
  sections.push('1. **不要忽略质量报告中的阻断性问题**,它们可能导致生成的代码不可用;')
  sections.push('2. **不要假设数据包包含完整业务逻辑**,仅包含页面结构和交互流程;')
  sections.push('3. **不要直接使用未确认的低置信度关系**,需人工核对;')
  sections.push('4. **不要忽略降级说明**,降级页面需特别注意;')
  sections.push('5. **不要假设所有页面都有 HTML**,部分页面仅有 DSL 和截图;')
  sections.push('6. **不要忽略 PRD 上下文**,它包含关键业务规则;')
  sections.push('7. **不要生成数据包中不存在的页面**,严格按数据包生成;')
  sections.push('8. **不要假设数据包是最新的**,设计稿可能已更新。')
  sections.push('')

  // § 12. 质量检查清单(生成代码后人工检查)
  sections.push('# 质量检查清单')
  sections.push('')
  sections.push('生成代码后,请逐项检查:')
  sections.push('- [ ] 所有页面是否已生成?')
  sections.push('- [ ] 页面间跳转是否正常?')
  sections.push('- [ ] 弹窗/抽屉是否能正常打开和关闭?')
  sections.push('- [ ] 表单提交是否有成功/失败提示?')
  sections.push('- [ ] 空状态/加载状态/错误状态是否已实现?')
  sections.push('- [ ] 视觉效果是否与截图一致?')
  sections.push('- [ ] 响应式布局是否正常?')
  sections.push('- [ ] 所有交互元素是否可点击?')
  sections.push('')

  return sections.join('\n')
}

function statusIcon(status: string): string {
  switch (status) {
    case 'success': return '✅'
    case 'fallback': return '🟡'
    case 'unavailable': return '⚪'
    case 'failed': return '❌'
    default: return '—'
  }
}

// ========== JSON 导出(完整数据包,内联真实资产) ==========

export function exportJSON(pkg: AIContextPackage, options?: ExportOptions): string {
  // 安全:导出前脱敏(审计 P0)
  let clean = sanitizePackageForExport(pkg)
  clean = applyRawPRDPolicy(clean, options?.includeRawPRD ?? false)
  return JSON.stringify(clean, null, 2)
}

// ========== Markdown 导出(可读性优先) ==========

export function exportMarkdown(pkg: AIContextPackage, options?: ExportOptions): string {
  // 安全:导出前脱敏(审计 P0)。Markdown 不内嵌 base64。
  let clean = sanitizePackageForExport(pkg)
  clean = applyRawPRDPolicy(clean, options?.includeRawPRD ?? false)
  pkg = clean

  const md: string[] = []

  md.push(`# ${pkg.project.name}`)
  md.push('')
  md.push(pkg.project.description)
  md.push('')
  md.push(`**导出时间**: ${new Date(pkg.packageMeta.exportedAt).toLocaleString()}`)
  md.push(`**导出模式**: ${pkg.packageMeta.exportMode}`)
  md.push(`**Schema 版本**: ${pkg.packageMeta.schemaVersion}`)
  md.push('')

  // 页面清单
  md.push('## 页面清单')
  md.push('')
  md.push('| 页面名称 | 类型 | 置信度 | 数据状态 |')
  md.push('| --- | --- | --- | --- |')
  pkg.pageList.pages.forEach(page => {
    md.push(
      `| ${page.pageName} | ${page.pageType} | ${(page.typeConfidence * 100).toFixed(0)}% | DSL:${statusIcon(page.dslStatus)} HTML:${statusIcon(page.htmlStatus)} 截图:${statusIcon(page.screenshotStatus)} |`
    )
  })
  md.push('')

  // 交互关系
  md.push('## 交互关系')
  md.push('')
  pkg.interactionGraph.interactions.forEach(inter => {
    md.push(`### ${inter.naturalLanguage}`)
    md.push(`- **置信度**: ${(inter.confidence * 100).toFixed(0)}%`)
    md.push(`- **来源**: ${inter.source.join(' + ')}`)
    if (inter.evidence) md.push(`- **证据**: ${inter.evidence}`)
    md.push('')
  })

  // 质量报告
  md.push('## 质量报告')
  md.push('')
  md.push(`**评分**: ${pkg.qualityReport.score}/100`)
  md.push('')
  if (pkg.qualityReport.blockingIssues.length > 0) {
    md.push('### 阻断性问题')
    pkg.qualityReport.blockingIssues.forEach(issue => {
      md.push(`- **${issue.title}**: ${issue.detail}`)
    })
    md.push('')
  }
  if (pkg.qualityReport.warnings.length > 0) {
    md.push('### 警告')
    pkg.qualityReport.warnings.forEach(issue => {
      md.push(`- **${issue.title}**: ${issue.detail}`)
    })
    md.push('')
  }

  return md.join('\n')
}

// ========== 统一导出入口 ==========

export function exportPackage(pkg: AIContextPackage, options: ExportOptions): string {
  // 注:各导出函数内部已各自 sanitize(幂等),此处只负责分派。
  switch (options.format) {
    case 'prompt':
      return generatePrompt(pkg, options)
    case 'json':
      return exportJSON(pkg, options)
    case 'markdown':
      return exportMarkdown(pkg, options)
    default:
      throw new Error(`Unsupported format: ${options.format}`)
  }
}
