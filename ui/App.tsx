import React, { useEffect, useState, useCallback } from 'react'
import './App.css'
import {
  sendMsgToPlugin,
  UIMessage,
  PluginMessage,
  type EnvInfo,
  type ProgressPayload,
  type ExportDonePayload,
  type ErrorPayload,
} from '@messages/sender'
import type { AIContextPackage } from '@schema/package-schema'
import { getDiagSnapshot, BUILD_ID, pushMainLog } from './diag'

type ExportMode = 'selected_frames' | 'current_page' | 'whole_document'

function App() {
  // ========== 状态 ==========
  const [env, setEnv] = useState<EnvInfo | null>(null)
  const [exportMode, setExportMode] = useState<ExportMode>('selected_frames')
  const [projectName, setProjectName] = useState('任务管理系统 MVP')
  const [projectDesc, setProjectDesc] = useState('用于生成可交互 HTML Demo 的设计上下文数据包')

  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [pkg, setPkg] = useState<AIContextPackage | null>(null)
  const [exportResult, setExportResult] = useState<{ format: string; content: string } | null>(null)
  const [error, setError] = useState<ErrorPayload | null>(null)

  const [toast, setToast] = useState('')
  const [dumpText, setDumpText] = useState('')

  // 调试面板
  const [debugOpen, setDebugOpen] = useState(false)

  const showToast = (s: string) => {
    setToast(s)
    window.setTimeout(() => setToast(''), 2200)
  }

  // ========== 接收主线程消息 ==========
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage ?? event.data
      if (!msg || !msg.type) return

      switch (msg.type) {
        case PluginMessage.ENV_INFO: {
          const e = msg.data as EnvInfo
          setEnv(e)
          // 设置主题
          if (e.themeColor === 'dark' || e.themeColor === 'light') {
            document.documentElement.setAttribute('data-theme', e.themeColor)
          }
          break
        }
        case PluginMessage.PROGRESS:
          setProgress(msg.data as ProgressPayload)
          break
        case PluginMessage.PACKAGE_GENERATED:
          setPkg(msg.data as AIContextPackage)
          setProgress(null)
          showToast('数据包生成完成 ✓')
          break
        case PluginMessage.EXPORT_DONE:
          setExportResult(msg.data as ExportDonePayload)
          setProgress(null)
          showToast('导出完成 ✓')
          break
        case PluginMessage.ERROR:
          setError(msg.data as ErrorPayload)
          setProgress(null)
          showToast('操作失败,请查看错误详情')
          break
        case 'LOG':
          // 主线程日志转发,写入诊断
          if (msg.data) {
            pushMainLog(msg.data.level || 'log', msg.data.args || [])
          }
          break
        default:
          break
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // ========== 业务操作 ==========
  const generate = useCallback(() => {
    setError(null)
    setPkg(null)
    setExportResult(null)
    sendMsgToPlugin({
      type: UIMessage.GENERATE_PACKAGE,
      data: {
        projectName,
        projectDescription: projectDesc,
        exportMode,
        aiSettings: null, // MVP 暂不启用 AI
        prdContext: null,
      },
    })
  }, [projectName, projectDesc, exportMode])

  const exportAs = useCallback((format: 'prompt' | 'json' | 'markdown') => {
    setError(null)
    setExportResult(null)
    sendMsgToPlugin({
      type: UIMessage.EXPORT,
      data: {
        projectName,
        projectDescription: projectDesc,
        exportMode,
        format,
        aiSettings: null,
        prdContext: null,
      },
    })
  }, [projectName, projectDesc, exportMode])

  const copyToClipboard = useCallback((text: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => showToast(`${label}已复制到剪贴板 ✓`),
        () => {
          setDumpText(text)
          showToast('请在下方文本框手动复制')
        }
      )
    } else {
      setDumpText(text)
      showToast('请在下方文本框手动复制')
    }
  }, [])

  const copyDiag = useCallback(() => {
    const diag = getDiagSnapshot()
    const md = `# 调试快照 (build=${BUILD_ID})\n\n\`\`\`json\n${JSON.stringify(diag, null, 2)}\n\`\`\`\n`
    copyToClipboard(md, '调试快照')
  }, [copyToClipboard])

  // ========== 渲染 ==========
  return (
    <div className="app">
      <header className="app-head">
        <h1>AI Context Packager</h1>
        <p className="sub">Step 3-7 完成,build={BUILD_ID}</p>
      </header>

      {/* 环境信息 */}
      <section className="env">
        <div className="env-row">
          <span>模式</span>
          <strong>{env?.command || (env?.hasCodegen ? 'devMode?' : 'canvas?')}</strong>
        </div>
        <div className="env-row">
          <span>codegen</span>
          <strong>{env ? (env.hasCodegen ? '✅' : '⚪') : '—'}</strong>
        </div>
      </section>

      {/* 主操作区 */}
      <section className="main">
        <div className="form-group">
          <label>项目名称</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="任务管理系统 MVP"
          />
        </div>

        <div className="form-group">
          <label>项目描述</label>
          <input
            type="text"
            value={projectDesc}
            onChange={(e) => setProjectDesc(e.target.value)}
            placeholder="用于生成可交互 HTML Demo"
          />
        </div>

        <div className="form-group">
          <label>导出范围</label>
          <select value={exportMode} onChange={(e) => setExportMode(e.target.value as ExportMode)}>
            <option value="selected_frames">选中的 Frame</option>
            <option value="current_page">当前页面</option>
            <option value="whole_document">整个文档(暂不支持)</option>
          </select>
        </div>

        <div className="actions">
          <button className="primary" onClick={generate} disabled={!!progress}>
            {progress ? `${progress.phase}...` : '一键生成数据包'}
          </button>
        </div>

        {progress && (
          <div className="progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <div className="progress-msg">{progress.message}</div>
          </div>
        )}

        {pkg && (
          <div className="result">
            <h3>✅ 数据包已生成</h3>
            <p>
              识别出 <strong>{pkg.pageList.pages.length}</strong> 个页面,
              <strong>{pkg.interactionGraph.totalInteractions}</strong> 条交互关系。
              质量评分: <strong>{pkg.qualityReport.score}/100</strong>
            </p>
            <div className="actions">
              <button onClick={() => exportAs('prompt')}>导出 Prompt</button>
              <button onClick={() => exportAs('json')}>导出 JSON</button>
              <button onClick={() => exportAs('markdown')}>导出 Markdown</button>
            </div>
          </div>
        )}

        {exportResult && (
          <div className="export-result">
            <h3>📋 {exportResult.format.toUpperCase()} 已生成</h3>
            <button onClick={() => copyToClipboard(exportResult.content, exportResult.format)}>
              复制到剪贴板
            </button>
            <details>
              <summary>预览({exportResult.content.length} 字符)</summary>
              <pre>{exportResult.content.slice(0, 500)}...</pre>
            </details>
          </div>
        )}

        {error && (
          <div className="error">
            <h3>❌ 错误</h3>
            <p>{error.message}</p>
            {error.stack && <pre>{error.stack}</pre>}
          </div>
        )}

        {dumpText && (
          <div className="dump">
            <p className="dump-hint">↓ 点进文本框 → 全选(Cmd+A)→ 复制(Cmd+C)</p>
            <textarea
              readOnly
              value={dumpText}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        )}
      </section>

      {/* 常驻调试面板 */}
      <section className="debug">
        <div className="debug-toggle" onClick={() => setDebugOpen(!debugOpen)}>
          🔧 调试面板 {debugOpen ? '▼' : '▶'}
        </div>
        {debugOpen && (
          <div className="debug-content">
            <p>开发期常驻调试面板,用于快速复制诊断快照给 Claude。发版时隐藏。</p>
            <button className="ghost" onClick={copyDiag}>
              复制调试快照
            </button>
          </div>
        )}
      </section>

      <footer className="foot">
        MasterGo AI Context Packager · Step 3-7 业务逻辑完成
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

export default App
