// ============================================================
// AI 设置组件(PRD §10.7)
// 配置 OpenAI-compatible API + 测试连接 + 清除 Key + CORS 提示
// ============================================================

import React, { useState } from 'react'
import type { AISettings } from '@schema/ai-settings'
import { DEFAULT_AI_SETTINGS, CORS_WARNING } from '@schema/ai-settings'
import { testAIConnection } from '../ai/ai-client'

interface Props {
  settings: AISettings
  onSave: (settings: AISettings) => void
  onClear: () => void
}

export function AISettingsPanel({ settings, onSave, onClear }: Props) {
  const [local, setLocal] = useState<AISettings>(settings || DEFAULT_AI_SETTINGS)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string>('')

  const update = (patch: Partial<AISettings>) => {
    setLocal({ ...local, ...patch })
  }

  const updateUsage = (key: keyof AISettings['usages'], val: boolean) => {
    setLocal({ ...local, usages: { ...local.usages, [key]: val } })
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult('')
    const res = await testAIConnection(local)
    setTesting(false)
    setTestResult(res.success ? `✅ ${res.content || '连接成功'}` : `❌ ${res.error}`)
  }

  return (
    <div className="ai-settings">
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={local.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          {' '}启用 AI 增强(可选)
        </label>
      </div>

      {/* CORS 提示 */}
      <div className="cors-warning">{CORS_WARNING}</div>

      <div className="form-group">
        <label>Base URL</label>
        <input
          type="text"
          value={local.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div className="form-group">
        <label>API Key(仅本地保存,可清除)</label>
        <input
          type="password"
          value={local.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
          placeholder="sk-... 或 github_pat_..."
        />
      </div>

      <div className="form-group">
        <label>Model</label>
        <input
          type="text"
          value={local.model}
          onChange={(e) => update({ model: e.target.value })}
          placeholder="gpt-4 / deepseek-chat / qwen-max"
        />
      </div>

      {/* 增强用途开关 */}
      <div className="form-group">
        <label>增强用途</label>
        <div className="usage-checks">
          <label><input type="checkbox" checked={local.usages.pageSemantics} onChange={(e) => updateUsage('pageSemantics', e.target.checked)} /> 页面语义</label>
          <label><input type="checkbox" checked={local.usages.relationInference} onChange={(e) => updateUsage('relationInference', e.target.checked)} /> 关系推断</label>
          <label><input type="checkbox" checked={local.usages.prdSummary} onChange={(e) => updateUsage('prdSummary', e.target.checked)} /> PRD 摘要</label>
          <label><input type="checkbox" checked={local.usages.promptCompression} onChange={(e) => updateUsage('promptCompression', e.target.checked)} /> Prompt 压缩</label>
          <label><input type="checkbox" checked={local.usages.qualityCheck} onChange={(e) => updateUsage('qualityCheck', e.target.checked)} /> 质量校验</label>
        </div>
      </div>

      <div className="actions">
        <button className="mini" onClick={handleTest} disabled={testing || !local.apiKey}>
          {testing ? '测试中...' : '测试连接'}
        </button>
        <button className="mini" onClick={() => onSave(local)}>保存设置</button>
        <button className="mini danger" onClick={onClear}>清除 Key</button>
      </div>

      {testResult && <div className="test-result">{testResult}</div>}
    </div>
  )
}
