// ============================================================
// 临时诊断模块(Spike 迭代调试用,定稿后整体删除)
// 目的:把"问题本质"所需的一切都收集起来,一键复制给 Claude。
//   - 覆盖 console.log/warn/error → 环形缓冲
//   - 捕获 window.onerror / unhandledrejection
//   - 记录收到的原始消息结构(用于确认消息是否被 pluginMessage 包裹)
//   - 记录环境(主题/尺寸/UA/clipboard 能力)
// 安装时机:必须在 App 之前(见 index.tsx 顶部 import)。
// ============================================================

export const BUILD_ID = 'probe-4' // 每次重新构建我会 +1,便于确认你跑的是哪一版

export interface LogEntry {
  t: number
  level: 'log' | 'warn' | 'error' | 'event' | 'main'
  msg: string
}

const MAX = 200
const logs: LogEntry[] = []
let rawFirstFromMain: unknown = undefined
let installed = false

// 供外部(App.tsx)写入主线程转发的日志
export function pushMainLog(level: string, args: any[]) {
  let msg = ''
  try {
    msg = args
      .map((p) => (typeof p === 'string' ? p : JSON.stringify(p, safeReplacer())))
      .join(' ')
  } catch {
    msg = args.map(String).join(' ')
  }
  logs.push({ t: Date.now(), level: 'main', msg: `[${level}] ${msg}`.slice(0, 500) })
  if (logs.length > MAX) logs.shift()
}

function push(level: LogEntry['level'], parts: any[]) {
  let msg = ''
  try {
    msg = parts
      .map((p) =>
        typeof p === 'string' ? p : JSON.stringify(p, safeReplacer())
      )
      .join(' ')
  } catch {
    msg = parts.map(String).join(' ')
  }
  logs.push({ t: Date.now(), level, msg: msg.slice(0, 500) })
  if (logs.length > MAX) logs.shift()
}

// 处理循环引用 / Uint8Array 等
function safeReplacer() {
  const seen = new WeakSet()
  return (_k: string, v: any) => {
    if (v instanceof Uint8Array) return `Uint8Array(len=${v.length})`
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]'
      seen.add(v)
    }
    if (typeof v === 'symbol') return v.toString()
    if (typeof v === 'function') return '[Function]'
    return v
  }
}

export function installDiag() {
  if (installed) return
  installed = true

  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }
  console.log = (...a: any[]) => {
    push('log', a)
    orig.log(...a)
  }
  console.warn = (...a: any[]) => {
    push('warn', a)
    orig.warn(...a)
  }
  console.error = (...a: any[]) => {
    push('error', a)
    orig.error(...a)
  }

  window.addEventListener('error', (e) => {
    push('error', [
      `window.onerror: ${e.message}`,
      `@${e.filename}:${e.lineno}:${e.colno}`,
    ])
  })
  window.addEventListener('unhandledrejection', (e: any) => {
    push('error', ['unhandledrejection:', String(e?.reason?.stack || e?.reason)])
  })

  // 捕获每条来自主线程的原始消息结构(只存第一条的完整形状)
  window.addEventListener('message', (event: MessageEvent) => {
    if (rawFirstFromMain === undefined) {
      try {
        rawFirstFromMain = {
          topLevelKeys: event.data ? Object.keys(event.data) : null,
          hasPluginMessage:
            !!event.data && typeof event.data === 'object' && 'pluginMessage' in event.data,
          dataSample: JSON.parse(JSON.stringify(event.data, safeReplacer())),
        }
      } catch {
        rawFirstFromMain = { note: '无法序列化原始消息', typeofData: typeof event.data }
      }
    }
    push('event', [
      'UI收到消息 type=',
      (event.data?.pluginMessage ?? event.data)?.type ?? '(无type)',
    ])
  })
}

export interface DiagSnapshot {
  buildId: string
  capturedAt: number
  ui: {
    themeAttr: string | null
    bodyBg: string
    innerSize: { w: number; h: number }
    rootChildren: number
    userAgent: string
    hasClipboard: boolean
  }
  rawFirstMessageFromMain: unknown
  logs: LogEntry[]
}

export function getDiagSnapshot(): DiagSnapshot {
  const bodyBg = (() => {
    try {
      return getComputedStyle(document.body).backgroundColor
    } catch {
      return '(n/a)'
    }
  })()
  return {
    buildId: BUILD_ID,
    capturedAt: Date.now(),
    ui: {
      themeAttr: document.documentElement.getAttribute('data-theme'),
      bodyBg,
      innerSize: { w: window.innerWidth, h: window.innerHeight },
      rootChildren: document.getElementById('root')?.childElementCount ?? -1,
      userAgent: navigator.userAgent,
      hasClipboard: !!navigator.clipboard,
    },
    rawFirstMessageFromMain: rawFirstFromMain,
    logs: [...logs],
  }
}
