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
