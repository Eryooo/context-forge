// ============================================================
// R3-S6: RelationEditor — 编辑已有关系
// 复用 relation-form 逻辑。保存后:source 追加 user,
// confidence≥0.9,confirmed/modified=true,naturalLanguage 重新生成。
// ============================================================

import React, { useState } from 'react'
import type { Interaction } from '@schema/interaction'
import type { PageNode } from '@schema/page-graph'
import {
  RelationFormState,
  ACTION_TYPE_OPTIONS,
  INTERACTION_TYPE_OPTIONS,
  TRIGGER_TYPE_OPTIONS,
  formToInteraction,
  interactionToForm,
} from './relation-form'

interface Props {
  pages: PageNode[]
  interaction: Interaction
  onSubmit: (interaction: Interaction) => void
  onCancel: () => void
}

export function RelationEditor({ pages, interaction, onSubmit, onCancel }: Props) {
  const activePages = pages.filter(p => !p.excluded)
  const [form, setForm] = useState<RelationFormState>(interactionToForm(interaction))

  const update = (patch: Partial<RelationFormState>) => setForm({ ...form, ...patch })

  const targetOptions = activePages.filter(p => {
    if (form.targetType === 'overlay') return p.pageType === 'modal' || p.pageType === 'drawer'
    if (form.targetType === 'state') return p.pageType.startsWith('state_')
    if (form.targetType === 'page') return !p.pageType.startsWith('state_') && p.pageType !== 'modal' && p.pageType !== 'drawer'
    return true
  })

  const targetIdField =
    form.targetType === 'overlay' ? 'targetOverlayId' :
    form.targetType === 'state' ? 'targetStateId' : 'targetPageId'
  const targetIdValue = (form as any)[targetIdField] as string

  const handleSubmit = () => {
    // formToInteraction 传 base=interaction → 编辑模式(source 追加 user, confidence≥0.9)
    const updated = formToInteraction(form, pages, interaction)
    onSubmit(updated)
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h3>编辑关系</h3>

        <div className="form-group">
          <label>来源页面</label>
          <select value={form.fromPage} onChange={e => update({ fromPage: e.target.value })}>
            {activePages.map(p => <option key={p.pageId} value={p.pageId}>{p.pageName}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>触发元素</label>
          <input value={form.triggerElement} onChange={e => update({ triggerElement: e.target.value })} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>触发类型</label>
            <select value={form.triggerElementType} onChange={e => update({ triggerElementType: e.target.value as any })}>
              {TRIGGER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>关系类型</label>
            <select value={form.interactionType} onChange={e => update({ interactionType: e.target.value as any })}>
              {INTERACTION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>动作</label>
            <select value={form.actionType} onChange={e => update({ actionType: e.target.value as any })}>
              {ACTION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>目标类型</label>
            <select value={form.targetType} onChange={e => update({ targetType: e.target.value as any })}>
              <option value="page">页面</option>
              <option value="overlay">弹窗/抽屉</option>
              <option value="state">状态页</option>
              <option value="self">当前页</option>
            </select>
          </div>
        </div>

        {(form.targetType === 'page' || form.targetType === 'overlay' || form.targetType === 'state') && (
          <div className="form-group">
            <label>目标</label>
            <select value={targetIdValue} onChange={e => update({ [targetIdField]: e.target.value } as any)}>
              <option value="">— 请选择 —</option>
              {targetOptions.map(p => <option key={p.pageId} value={p.pageId}>{p.pageName}</option>)}
            </select>
          </div>
        )}

        <div className="form-group">
          <label>成功结果</label>
          <input value={form.expectedState} onChange={e => update({ expectedState: e.target.value })} />
        </div>
        <div className="form-group">
          <label>失败结果</label>
          <input value={form.failureState} onChange={e => update({ failureState: e.target.value })} />
        </div>

        <div className="dialog-actions">
          <button className="mini" onClick={onCancel}>取消</button>
          <button className="mini active" onClick={handleSubmit}>保存</button>
        </div>
      </div>
    </div>
  )
}
