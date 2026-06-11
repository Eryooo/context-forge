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
import type { ExportMode } from '@schema/package-schema'
import type { PRDContext } from '@schema/package-schema'
import type { AISettings } from '@schema/ai-settings'
import type { Interaction } from '@schema/interaction'
import type { PageNode } from '@schema/page-graph'
import { getDiagSnapshot, BUILD_ID, pushMainLog } from './diag'
import { FlowConfirm } from './components/FlowConfirm'
import { PRDPanel } from './components/PRDPanel'
import { AISettingsPanel } from './components/AISettingsPanel'
import { PageReviewPanel } from './components/PageReviewPanel'
import { recalculatePackage } from '@modules/package/recalculate'

// 流程阶段(8 个,审计 P0(UX) / 10.2)
type Step = 'config' | 'identifying' | 'page-review' | 'flow-confirm' | 'prd' | 'ai-settings' | 'quality' | 'export'

function App() {
  // ========== 状态 ==========
  const [env, setEnv] = useState<EnvInfo | null>(null)
  const [currentStep, setCurrentStep] = useState<Step>('config')

  // 配置
  const [exportMode, setExportMode] = useState<ExportMode>('selected_frames')
  const [projectName, setProjectName] = useState('任务管理系统 MVP')
  const [projectDesc, setProjectDesc] = useState('用于生成可交互 HTML Demo 的设计上下文数据包')

  // PRD 补充
  const [prdContext, setPrdContext] = useState<PRDContext | null>(null)
  const [includeRawPRD, setIncludeRawPRD] = useState(false)

  // R3-S12:导出目标工具
  const [targetTool, setTargetTool] = useState<'claude_code' | 'codex' | 'cursor' | 'chatgpt' | 'generic'>('claude_code')
  // R3-S14:导出风险 gating —— 用户确认"仍然导出"
  const [forceExport, setForceExport] = useState(false)

  // AI 设置
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null)

  // 生成结果
  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [pkg, setPkg] = useState<AIContextPackage | null>(null)
  const [exportResult, setExportResult] = useState<{ format: string; content: string } | null>(null)
  const [error, setError] = useState<ErrorPayload | null>(null)

  const [toast, setToast] = useState('')

  // R3.1:调试面板(可折叠,默认收起)
  const [debugOpen, setDebugOpen] = useState(false)
  const [codegenProbeResult, setCodegenProbeResult] = useState<any>(null)

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
          setCurrentStep('page-review') // 生成后自动进入页面确认
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
        case PluginMessage.PRD_DRAFT_LOADED:
          if (msg.data) setPrdContext(msg.data)
          break
        case PluginMessage.PRD_DRAFT_SAVED:
          showToast('PRD 草稿已保存 ✓')
          break
        case PluginMessage.SETTINGS_LOADED:
          if (msg.data) setAiSettings(msg.data)
          break
        case PluginMessage.SETTINGS_SAVED:
          showToast('AI 设置已保存 ✓')
          break
        case PluginMessage.SETTINGS_CLEARED:
          setAiSettings(null)
          showToast('AI Key 已清除 ✓')
          break
        case 'LOG':
          if (msg.data) {
            pushMainLog(msg.data.level || 'log', msg.data.args || [])
          }
          break
        case PluginMessage.CODEGEN_PROBE_RESULT:
          setCodegenProbeResult(msg.data)
          showToast('DevMode codegen 探测完成')
          break
        default:
          break
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // 加载 PRD 草稿和 AI 设置
  useEffect(() => {
    sendMsgToPlugin({ type: UIMessage.LOAD_PRD_DRAFT })
    sendMsgToPlugin({ type: UIMessage.LOAD_SETTINGS })
  }, [])

  // ========== 业务操作 ==========
  const generate = useCallback(() => {
    setError(null)
    setPkg(null)
    setExportResult(null)
    setCurrentStep('identifying')
    sendMsgToPlugin({
      type: UIMessage.GENERATE_PACKAGE,
      data: {
        projectName,
        projectDescription: projectDesc,
        exportMode,
        aiSettings,
        prdContext,
      },
    })
  }, [projectName, projectDesc, exportMode, aiSettings, prdContext])

  const exportAs = useCallback((format: 'prompt' | 'json' | 'markdown') => {
    if (!pkg) return
    setError(null)
    setExportResult(null)
    // R3-S1+S12:导出当前已确认的 pkg(写入用户选择的目标工具),不重新生成
    const pkgWithTarget: AIContextPackage = {
      ...pkg,
      aiExecutionInstruction: {
        ...pkg.aiExecutionInstruction,
        targetTool,
      },
    }
    sendMsgToPlugin({
      type: UIMessage.EXPORT_CURRENT_PACKAGE,
      data: {
        pkg: pkgWithTarget,
        format,
        includeRawPRD,
        targetTool,
      },
    })
  }, [pkg, includeRawPRD, targetTool])

  const savePRDDraft = useCallback((draft: PRDContext) => {
    sendMsgToPlugin({ type: UIMessage.SAVE_PRD_DRAFT, data: draft })
  }, [])

  const saveAISettings = useCallback((settings: AISettings) => {
    setAiSettings(settings)
    sendMsgToPlugin({ type: UIMessage.SAVE_SETTINGS, data: settings })
  }, [])

  const clearAISettings = useCallback(() => {
    sendMsgToPlugin({ type: UIMessage.CLEAR_SETTINGS })
  }, [])

  // 用户编辑页面后重算(R3-S4:完整重建 pageGraph)
  const handlePageEdit = useCallback((pages: PageNode[]) => {
    if (!pkg) return
    const recalculated = recalculatePackage(pkg, { pages })
    setPkg(recalculated)
  }, [pkg])

  // 用户编辑关系后重算
  const handleInteractionEdit = useCallback((interactions: Interaction[]) => {
    if (!pkg) return
    const recalculated = recalculatePackage(pkg, { interactions })
    setPkg(recalculated)
  }, [pkg])

  // R3.1-3:用户标记问题"无需处理",记入 dismissedQuestionIds
  const handleDismissQuestion = useCallback((questionId: string) => {
    if (!pkg) return
    const recalculated = recalculatePackage(pkg, { dismissQuestionId: questionId })
    setPkg(recalculated)
  }, [pkg])

  // R3.1:调试 —— 复制诊断快照(主线程日志+环境+原始消息结构)
  const copyDiagSnapshot = useCallback(() => {
    const snap = getDiagSnapshot()
    const text = JSON.stringify(snap, null, 2)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast('诊断快照已复制 ✓'),
        () => showToast('复制失败,见下方文本框')
      )
    }
    setToast('诊断快照已生成')
    // 兜底:也放进 exportResult 文本框便于手动复制
    setExportResult({ format: 'diag', content: text })
  }, [])

  // R3.1:调试 —— 运行 DevMode codegen 探测
  const runCodegenProbe = useCallback(() => {
    setCodegenProbeResult(null)
    sendMsgToPlugin({ type: UIMessage.RUN_CODEGEN_PROBE })
  }, [])

  // ========== 流程导航(8 阶段)==========
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'config', label: '配置项目' },
    { key: 'identifying', label: '识别中...' },
    { key: 'page-review', label: '页面确认' },
    { key: 'flow-confirm', label: '流程确认' },
    { key: 'prd', label: 'PRD 补充' },
    { key: 'ai-settings', label: 'AI 设置' },
    { key: 'quality', label: '质量预览' },
    { key: 'export', label: '导出' },
  ]

  const stepIndex = steps.findIndex((s) => s.key === currentStep)

  const nextStep = () => {
    const next = steps[stepIndex + 1]
    if (next) setCurrentStep(next.key)
  }

  const prevStep = () => {
    const prev = steps[stepIndex - 1]
    if (prev) setCurrentStep(prev.key)
  }

  // ========== 渲染 ==========
  return (
    <div className="app-container">
      {/* 顶部步骤条 */}
      <div className="step-nav">
        {steps.filter(s => s.key !== 'identifying').map((s, i) => (
          <div
            key={s.key}
            className={`step-item ${currentStep === s.key ? 'active' : ''} ${stepIndex > i ? 'done' : ''}`}
            onClick={() => {
              if (s.key !== 'identifying' && (stepIndex > i || s.key === 'config')) setCurrentStep(s.key)
            }}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* Error */}
      {error && (
        <div className="error-box">
          <strong>错误:</strong> {error.message}
          <button className="close-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* 主内容区 */}
      <div className="main-content">
        {currentStep === 'config' && (
          <div className="step-config">
            <h2>项目配置</h2>
            <div className="form-group">
              <label>项目名称</label>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>项目描述</label>
              <textarea value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} rows={2} />
            </div>
            <div className="form-group">
              <label>导出范围</label>
              <select value={exportMode} onChange={(e) => setExportMode(e.target.value as ExportMode)}>
                <option value="selected_frames">选中的 Frame</option>
                <option value="selected_nodes">选中的节点(任意)</option>
                <option value="current_page_top_frames">当前页面顶层 Frame</option>
                <option value="container_children">容器内顶层页面</option>
                <option value="manual_selected_pages">手动勾选页面</option>
                <option value="flow_group">按流程分组</option>
              </select>
            </div>
            <div className="actions">
              <button className="primary" onClick={generate}>开始识别</button>
            </div>
          </div>
        )}

        {currentStep === 'identifying' && (
          <div className="step-progress">
            <h2>正在识别...</h2>
            {progress && (
              <div>
                <div className="progress-text">
                  {progress.phase} ({progress.current}/{progress.total}): {progress.message}
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 'page-review' && pkg && (
          <div className="step-page-review">
            <h2>页面识别结果</h2>
            <PageReviewPanel pages={pkg.pageList.pages} onChange={handlePageEdit} />
            <div className="actions">
              <button onClick={prevStep}>返回配置</button>
              <button className="primary" onClick={nextStep}>下一步:确认流程</button>
            </div>
          </div>
        )}

        {currentStep === 'flow-confirm' && pkg && (
          <div className="step-flow-confirm">
            <h2>页面流程确认</h2>
            <FlowConfirm pkg={pkg} onUpdate={handleInteractionEdit} onDismissQuestion={handleDismissQuestion} />
            <div className="actions">
              <button onClick={prevStep}>返回页面确认</button>
              <button className="primary" onClick={nextStep}>下一步:补充 PRD</button>
            </div>
          </div>
        )}

        {currentStep === 'prd' && (
          <div className="step-prd">
            <h2>PRD 业务规则补充(可选)</h2>
            <PRDPanel
              value={prdContext}
              onChange={setPrdContext}
              onSaveDraft={savePRDDraft}
              includeRawPRD={includeRawPRD}
              onToggleIncludeRaw={setIncludeRawPRD}
            />
            <div className="actions">
              <button onClick={prevStep}>返回流程确认</button>
              <button className="primary" onClick={nextStep}>下一步:AI 设置</button>
            </div>
          </div>
        )}

        {currentStep === 'ai-settings' && (
          <div className="step-ai-settings">
            <h2>AI 增强设置(可选)</h2>
            <AISettingsPanel
              settings={aiSettings || { enabled: false, provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4', temperature: 0.2, maxTokens: 4096, timeout: 60000, usages: { pageSemantics: false, relationInference: false, prdSummary: false, promptCompression: false, qualityCheck: false } }}
              onSave={saveAISettings}
              onClear={clearAISettings}
            />
            <div className="actions">
              <button onClick={prevStep}>返回 PRD 补充</button>
              <button className="primary" onClick={nextStep}>下一步:质量预览</button>
            </div>
          </div>
        )}

        {currentStep === 'quality' && pkg && (
          <div className="step-quality">
            <h2>质量报告</h2>
            <div className="quality-score">
              <div className="score-num">{pkg.qualityReport.score}</div>
              <div className="score-label">/100</div>
            </div>
            {/* R3-S13:分项评分 */}
            {pkg.qualityReport.dimensions && (
              <div className="quality-dimensions">
                {([
                  ['数据完整度', pkg.qualityReport.dimensions.dataCompleteness],
                  ['页面确认度', pkg.qualityReport.dimensions.pageConfirmation],
                  ['交互完整度', pkg.qualityReport.dimensions.interactionCompleteness],
                  ['PRD 完整度', pkg.qualityReport.dimensions.prdCompleteness],
                  ['导出可用性', pkg.qualityReport.dimensions.exportReadiness],
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label} className="dim-row">
                    <span className="dim-label">{label}</span>
                    <div className="dim-bar">
                      <div
                        className="dim-fill"
                        style={{
                          width: `${val}%`,
                          background: val >= 70 ? 'var(--success,#22a06b)' : val >= 40 ? 'var(--warning,#d97706)' : 'var(--error,#e5484d)',
                        }}
                      />
                    </div>
                    <span className="dim-val">{val}</span>
                  </div>
                ))}
              </div>
            )}
            {pkg.qualityReport.blockingIssues.length > 0 && (
              <div className="quality-section">
                <h3>阻断性问题 ({pkg.qualityReport.blockingIssues.length})</h3>
                {pkg.qualityReport.blockingIssues.map((issue, i) => (
                  <div key={i} className="issue-card blocking">
                    <strong>{issue.title}</strong>
                    <p>{issue.detail}</p>
                    <p className="suggestion">建议:{issue.suggestion}</p>
                  </div>
                ))}
              </div>
            )}
            {pkg.qualityReport.warnings.length > 0 && (
              <div className="quality-section">
                <h3>警告 ({pkg.qualityReport.warnings.length})</h3>
                {pkg.qualityReport.warnings.slice(0, 5).map((issue, i) => (
                  <div key={i} className="issue-card warning">
                    <strong>{issue.title}</strong>
                    <p>{issue.detail}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="actions">
              <button onClick={prevStep}>返回 AI 设置</button>
              <button className="primary" onClick={nextStep}>下一步:导出</button>
            </div>
          </div>
        )}

        {currentStep === 'export' && pkg && (
          <div className="step-export">
            <h2>导出数据包</h2>
            {/* R3-S12:目标工具选择 */}
            <div className="form-group">
              <label>目标 AI 工具</label>
              <select value={targetTool} onChange={(e) => setTargetTool(e.target.value as any)}>
                <option value="claude_code">Claude Code</option>
                <option value="codex">Codex</option>
                <option value="cursor">Cursor</option>
                <option value="chatgpt">ChatGPT</option>
                <option value="generic">通用 / Generic</option>
              </select>
            </div>
            {/* R3-S14:导出风险 gating */}
            {(() => {
              const blocking = pkg.qualityReport.blockingIssues.length
              const warnings = pkg.qualityReport.warnings.length
              const canRecommend = blocking === 0
              const exportEnabled = canRecommend || forceExport
              return (
                <>
                  {blocking > 0 && (
                    <div className="export-gate blocking">
                      <p>存在 {blocking} 个阻断性问题,不建议直接导出。处理后导出的数据包更可信。</p>
                      {!forceExport && (
                        <button className="mini danger" onClick={() => setForceExport(true)}>
                          我已了解,仍然导出
                        </button>
                      )}
                    </div>
                  )}
                  {blocking === 0 && warnings > 0 && (
                    <div className="export-gate warning">
                      <p>有 {warnings} 个警告项,可以导出,但建议先核对以提升质量。</p>
                    </div>
                  )}
                  <div className="export-options">
                    <button disabled={!exportEnabled} onClick={() => exportAs('json')}>导出 JSON</button>
                    <button disabled={!exportEnabled} onClick={() => exportAs('prompt')}>导出 Prompt</button>
                    <button disabled={!exportEnabled} onClick={() => exportAs('markdown')}>导出 Markdown</button>
                  </div>
                </>
              )
            })()}
            {exportResult && (
              <div className="export-result">
                <h3>导出完成({exportResult.format})</h3>
                <textarea value={exportResult.content} readOnly rows={10} />
                <button onClick={() => navigator.clipboard.writeText(exportResult.content)}>复制到剪贴板</button>
              </div>
            )}
            <div className="actions">
              <button onClick={prevStep}>返回质量预览</button>
              <button className="primary" onClick={() => setCurrentStep('config')}>重新开始</button>
            </div>
          </div>
        )}
      </div>

      {/* R3.1:调试面板(可折叠,默认收起,开发用)*/}
      <div className="debug-panel">
        <div className="debug-toggle" onClick={() => setDebugOpen(!debugOpen)}>
          🔧 调试面板 {debugOpen ? '▾' : '▸'}
        </div>
        {debugOpen && (
          <div className="debug-content">
            <div className="debug-actions">
              <button className="mini" onClick={copyDiagSnapshot}>复制诊断快照</button>
              <button className="mini" onClick={runCodegenProbe}>运行 DevMode codegen 探测</button>
            </div>
            {codegenProbeResult && (
              <pre className="debug-probe">{JSON.stringify(codegenProbeResult, null, 2)}</pre>
            )}
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="footer">
        <span>ContextForge {BUILD_ID}</span>
        {env && <span>MG API {env.apiVersion}</span>}
      </div>
    </div>
  )
}

export default App
