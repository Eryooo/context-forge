// ============================================================
// PRD 补充面板(审计 P0 / 10.2)
// 字段: summary/businessRules/userStories/acceptanceCriteria/specialRules/rawPRD
// 交互: 粘贴/清空/保存草稿/折叠/是否导出 rawPRD
// 安全: rawPRD 默认不进历史记录(草稿保存时排除)
// ============================================================

import React, { useState } from 'react'
import type { PRDContext } from '@schema/package-schema'

interface Props {
  value: PRDContext | null
  onChange: (prd: PRDContext | null) => void
  onSaveDraft: (prd: PRDContext) => void
  includeRawPRD: boolean
  onToggleIncludeRaw: (v: boolean) => void
}

// 多行文本 → 字符串数组(按行拆,去空行)
function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((l) => l.length > 0)
}

function arrayToLines(arr?: string[]): string {
  return (arr || []).join('\n')
}

export function PRDPanel({ value, onChange, onSaveDraft, includeRawPRD, onToggleIncludeRaw }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const prd = value || {}

  const update = (patch: Partial<PRDContext>) => {
    onChange({ ...prd, ...patch })
  }

  const clearAll = () => {
    onChange(null)
  }

  const saveDraft = () => {
    // 草稿排除 rawPRD(审计 B4:rawPRD 默认不进历史/草稿)
    const { rawPRD, ...draftSafe } = prd
    onSaveDraft(draftSafe)
  }

  const hasContent =
    !!prd.summary ||
    (prd.businessRules?.length || 0) > 0 ||
    (prd.userStories?.length || 0) > 0 ||
    (prd.acceptanceCriteria?.length || 0) > 0 ||
    (prd.specialRules?.length || 0) > 0 ||
    !!prd.rawPRD

  return (
    <div className="prd-panel">
      <div className="panel-head" onClick={() => setCollapsed(!collapsed)}>
        <span className="panel-title">PRD / 业务规则补充{hasContent ? ' ✓' : ''}</span>
        <span className="panel-toggle">{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div className="panel-body">
          <p className="panel-hint">
            补充设计稿无法表达的业务规则,可大幅提升外部 AI 生成准确性。选填。
          </p>

          <div className="form-group">
            <label>PRD 摘要</label>
            <textarea
              value={prd.summary || ''}
              onChange={(e) => update({ summary: e.target.value })}
              placeholder="一句话描述产品做什么,例如:用户可查看任务列表、新增任务、进入详情。"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>业务规则(每行一条)</label>
            <textarea
              value={arrayToLines(prd.businessRules)}
              onChange={(e) => update({ businessRules: linesToArray(e.target.value) })}
              placeholder="新增任务提交成功后刷新列表&#10;点击任务列表项进入详情页"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>用户故事(每行一条)</label>
            <textarea
              value={arrayToLines(prd.userStories)}
              onChange={(e) => update({ userStories: linesToArray(e.target.value) })}
              placeholder="作为用户,我希望能快速新增任务"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>验收标准(每行一条)</label>
            <textarea
              value={arrayToLines(prd.acceptanceCriteria)}
              onChange={(e) => update({ acceptanceCriteria: linesToArray(e.target.value) })}
              placeholder="提交后必须有成功提示"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>特殊规则(每行一条)</label>
            <textarea
              value={arrayToLines(prd.specialRules)}
              onChange={(e) => update({ specialRules: linesToArray(e.target.value) })}
              placeholder="权限不足时跳转登录页"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>原始 PRD 全文(可选,默认不进历史)</label>
            <textarea
              value={prd.rawPRD || ''}
              onChange={(e) => update({ rawPRD: e.target.value })}
              placeholder="可粘贴完整 PRD。注意:可能含敏感业务内容,默认不保存到草稿,导出由下方开关控制。"
              rows={4}
            />
          </div>

          <label className="prd-include-raw">
            <input
              type="checkbox"
              checked={includeRawPRD}
              onChange={(e) => onToggleIncludeRaw(e.target.checked)}
            />
            {' '}导出时包含原始 PRD 全文(默认关闭)
          </label>

          <div className="actions">
            <button className="mini" onClick={saveDraft}>保存草稿</button>
            <button className="mini danger" onClick={clearAll}>清空</button>
          </div>
        </div>
      )}
    </div>
  )
}
