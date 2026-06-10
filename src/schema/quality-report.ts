// ============================================================
// 质量报告 Schema — 16 项检查 + 评分(PRD §14)
// ============================================================

export type IssueSeverity = 'blocking' | 'warning' | 'info'

export interface QualityIssue {
  id: string
  severity: IssueSeverity
  category: string              // e.g. "页面命名","关系完整性","数据采集"
  title: string                 // e.g. "新增弹窗缺少提交成功状态"
  detail: string                // 详细说明
  relatedPage?: string          // 关联页面 ID
  relatedElement?: string       // 关联元素
  suggestion?: string           // 修复建议
}

// 质量报告
export interface QualityReport {
  score: number                 // 0–100,综合评分

  // 16 项检查结果(PRD §14.1)
  checks: {
    hasUnnamedPages: boolean              // 是否存在未命名页面
    hasDuplicatePageNames: boolean        // 是否存在重复页面名
    hasUnclassifiedPages: boolean         // 是否存在未归属页面
    hasMissingDSL: boolean                // 是否存在 DSL 缺失
    hasMissingHTML: boolean               // 是否存在 HTML 缺失(不阻断,仅提示)
    hasMissingScreenshot: boolean         // 是否存在截图缺失
    hasUnconfirmedHighRiskRelations: boolean  // 是否存在未确认高风险关系
    hasTargetPageNotFound: boolean        // 是否存在目标页面不存在的关系
    hasModalWithoutClose: boolean         // 是否存在弹窗无关闭路径
    hasDetailWithoutBack: boolean         // 是否存在详情页无返回路径
    hasFormWithoutSuccessState: boolean   // 是否存在表单提交无成功状态
    hasFormWithoutFailureState: boolean   // 是否存在表单提交无失败状态
    hasEntryPageMissing: boolean          // 是否存在主流程入口缺失
    hasPRDMissing: boolean                // 是否存在 PRD 缺失(用户未补充)
    hasPromptTooLong: boolean             // 是否存在 Prompt 过长(>50k tokens)
    hasPackageTooLarge: boolean           // 是否存在数据包过大(>50MB)
  }

  // 问题列表
  blockingIssues: QualityIssue[]     // 阻断性问题(必须解决)
  warnings: QualityIssue[]           // 警告(建议解决)

  // 未解决问题(来自 InteractionGraph)
  unresolvedQuestions: Array<{
    question: string
    relatedPage?: string
    relatedElement?: string
    suggestedOptions: string[]
  }>

  // 建议
  suggestions: string[]          // e.g. "建议为提交按钮补充成功 Toast"

  // 元信息
  generatedAt: number            // 时间戳
  totalIssues: number
}

// 评分算法(PRD §14.2)
export function calculateQualityScore(checks: QualityReport['checks'], issues: QualityIssue[]): number {
  let score = 100

  // blocking 问题每个扣 20 分
  const blockingCount = issues.filter(i => i.severity === 'blocking').length
  score -= blockingCount * 20

  // warning 每个扣 5 分
  const warningCount = issues.filter(i => i.severity === 'warning').length
  score -= warningCount * 5

  // 特定检查项额外扣分
  if (checks.hasEntryPageMissing) score -= 10
  if (checks.hasPromptTooLong || checks.hasPackageTooLarge) score -= 5

  return Math.max(0, Math.min(100, score))
}
