// ============================================================
// AI 增强服务 — 整合 AI 能力到数据包,失败自动回退
// 原则(PRD §10.1):AI 是增强不是依赖,任何失败都不阻断主流程
// ============================================================

import type { AISettings } from '@schema/ai-settings'
import type { AIContextPackage } from '@schema/package-schema'
import {
  enhancePageSemantics,
  summarizePRD,
  compressPrompt,
  testAIConnection,
  type AICallResult,
} from './ai-client'

export interface EnhancementResult {
  applied: string[]      // 成功应用的增强项
  failed: string[]       // 失败的增强项(已回退)
  pkg: AIContextPackage  // 增强后的数据包(失败项保持原样)
}

// 对数据包应用 AI 增强(全程不阻断,失败回退)
export async function enhancePackage(
  pkg: AIContextPackage,
  settings: AISettings,
  onProgress?: (msg: string) => void
): Promise<EnhancementResult> {
  const applied: string[] = []
  const failed: string[] = []

  if (!settings.enabled || !settings.apiKey) {
    return { applied, failed: ['AI 未启用'], pkg }
  }

  // 1. PRD 摘要增强
  if (settings.usages.prdSummary && pkg.prdContext?.rawPRD) {
    onProgress?.('AI 正在摘要 PRD...')
    const res = await summarizePRD(settings, pkg.prdContext.rawPRD)
    if (res.success && res.content) {
      pkg.prdContext.summary = res.content
      applied.push('PRD 摘要')
    } else {
      failed.push(`PRD 摘要(${res.error})`)
    }
  }

  // 2. 页面语义增强(仅对 unknown 类型页面,节省调用)
  if (settings.usages.pageSemantics) {
    const unknownPages = pkg.pageList.pages.filter(p => p.pageType === 'unknown')
    for (const page of unknownPages.slice(0, 5)) { // 限制 5 个,控制成本
      onProgress?.(`AI 正在分析页面"${page.pageName}"...`)
      const res = await enhancePageSemantics(
        settings,
        page.pageName,
        JSON.stringify(page.summary)
      )
      if (res.success && res.content) {
        // 把 AI 分析结果写入摘要(不强行改类型,避免误判)
        page.summary.layout += ` [AI: ${res.content.slice(0, 100)}]`
        applied.push(`页面语义(${page.pageName})`)
      } else {
        failed.push(`页面语义(${page.pageName})`)
      }
    }
  }

  // 标记已 AI 增强
  pkg.packageMeta.aiEnhanced = applied.length > 0

  return { applied, failed, pkg }
}

// 重导出测试连接(供设置页用)
export { testAIConnection }
export type { AICallResult }
