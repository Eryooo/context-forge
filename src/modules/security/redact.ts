// ============================================================
// 敏感数据脱敏 — redactSensitive
// 用于 console 转发、debug snapshot 等任何可能输出敏感内容的场景。
// 审计 P0:API Key / rawPRD 等绝不能泄漏到 console / UI / 日志。
// ============================================================

const SENSITIVE_KEY_PATTERNS = [
  'apikey',
  'api_key',
  'authorization',
  'bearer',
  'token',
  'secret',
  'password',
  'rawprd',
  'raw_prd',
]

const REDACTED = '[REDACTED]'

// 判断某个 key 名是否敏感(大小写无关 + 去分隔符)
function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '')
  return SENSITIVE_KEY_PATTERNS.some((p) => normalized.includes(p.replace(/[-_]/g, '')))
}

// 字符串里如出现 "Bearer xxx" / "sk-xxx" 等,做值级脱敏
function redactStringValue(s: string): string {
  let out = s
  // Bearer token
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer ' + REDACTED)
  // sk- / github_pat_ 等常见 key 前缀
  out = out.replace(/\b(sk-[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/g, REDACTED)
  return out
}

/**
 * 递归脱敏任意值。
 * - 对象:敏感 key → [REDACTED],其余递归
 * - 数组:逐项递归
 * - 字符串:做值级 token 脱敏
 * - 其它原始类型:原样返回
 * 处理循环引用。
 */
export function redactSensitive(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) return value

  if (typeof value === 'string') return redactStringValue(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'function') return '[Function]'
  if (typeof value === 'symbol') return value.toString()

  if (value instanceof Uint8Array) return `Uint8Array(len=${value.length})`

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]'
    seen.add(value as object)

    if (Array.isArray(value)) {
      return value.map((v) => redactSensitive(v, seen))
    }

    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = REDACTED
      } else {
        out[k] = redactSensitive(v, seen)
      }
    }
    return out
  }

  return value
}

// 对一组 console 参数批量脱敏(供 main.ts console 转发用)
export function redactArgs(args: unknown[]): unknown[] {
  return args.map((a) => redactSensitive(a))
}
