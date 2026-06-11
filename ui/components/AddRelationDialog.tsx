// ============================================================
// R3-S5: AddRelationDialog — 手动新增关系
// 0 关系状态或任意时刻,用户可手动补充页面跳转/弹窗/状态关系。
// 提交后生成 user interaction(confidence=1, source=['user'], confirmed/modified=true)
// ============================================================

import React, { useState } from 'react'
import type { Interaction } from '@schema/interaction'
import type { PageNode } from '@schema/page-graph'
import {
  RelationFormState,
  DEFAULT_RELATION_FORM,
  ACTION_TYPE_OPTIONS,
  INTERACTION_TYPE_OPTIONS,
  TRIGGER_TYPE_OPTIONS,
  formToInteraction,
} from './relation-form'

interface Props {
  pages: PageNode[]
  onSubmit: (interaction: Interaction) => void
  onCancel: () => void
  // 预设(如"添加弹窗关系"快捷入口)
  preset?: Partial<RelationFormState>
}

export function AddRelationDialog({ pages, onSubmit, onCancel, preset }: Props) {
  const activePages = pages.filter(p => !p.excluded)
  const [form, setForm] = useState<RelationFormState>({
    ...DEFAULT_RELATION_FORM,
    fromPage: activePages[0]?.pageId || '',
    ...preset,
  })

  const update = (patch: Partial<RelationFormState>) => setForm({ ...form, ...patch })

  // 目标页面下拉(按 targetType 过滤)
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

  const canSubmit = !!form.fromPage && (
    form.actionType === 'goBack' || form.actionType === 'closeModal' ||
    form.actionType === 'closeDrawer' || form.actionType === 'refresh' ||
    !!targetIdValue
  )

  const handleSubmit = () => {
    if (!canSubmit) return
    const inter = formToInteraction(form, pages)
    onSubmit(inter)
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h3>新增关系</h3>

        <div className="form-group">
          <label>来源页面</label>
          <select value={form.fromPage} onChange={e => update({ fromPage: e.target.value })}>
            {activePages.map(p => <option key={p.pageId} value={p.pageId}>{p.pageName}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>触发元素(可选)</label>
          <input value={form.triggerElement} onChange={e => update({ triggerElement: e.target.value })}
            placeholder="如:新增按钮 / 列表项" />
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
          <label>成功结果(可选)</label>
          <input value={form.expectedState} onChange={e => update({ expectedState: e.target.value })}
            placeholder="如:打开新增弹窗" />
        </div>
        <div className="form-group">
          <label>失败结果(可选)</label>
          <input value={form.failureState} onChange={e => update({ failureState: e.target.value })}
            placeholder="如:提交失败显示错误提示" />
        </div>

        <div className="dialog-actions">
          <button className="mini" onClick={onCancel}>取消</button>
          <button className="mini active" onClick={handleSubmit} disabled={!canSubmit}>添加</button>
        </div>
        {!canSubmit && <p className="dialog-hint">请选择来源页面和目标(关闭/返回类动作无需目标)。</p>}
      </div>
    </div>
  )
}
