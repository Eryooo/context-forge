// ============================================================
// 稳定 ID 生成 — createStableInteractionId
// 审计 7.2:替换 Date.now()+Math.random(),保证同设计稿多次导出 ID 一致。
// 用途:用户确认记录可复用、支持 diff、历史回溯。
// ============================================================

/**
 * 生成稳定的交互关系 ID。
 * 基于 hash(fromPageId + triggerNodeId + actionType + targetId),多次导出同一设计稿 ID 不变。
 * 返回 int_<hash8位>,例如 int_3a4b7c21。
 */
export function createStableInteractionId(
  fromPageId: string,
  triggerNodeId?: string,
  actionType?: string,
  targetId?: string
): string {
  const input = `${fromPageId}|${triggerNodeId || ''}|${actionType || ''}|${targetId || ''}`
  const hash = simpleHash(input)
  return `int_${hash.slice(0, 8)}`
}

// 简单 FNV-1a hash(8位十六进制),足够区分交互关系
function simpleHash(s: string): string {
  let hash = 2166136261 // FNV-1a 32-bit offset
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 生成稳定的待确认问题 ID。
 * 基于 hash(question + relatedPage + relatedElement)。
 */
export function createStableQuestionId(
  question: string,
  relatedPage?: string,
  relatedElement?: string
): string {
  const input = `${question}|${relatedPage || ''}|${relatedElement || ''}`
  const hash = simpleHash(input)
  return `q_${hash.slice(0, 6)}`
}
