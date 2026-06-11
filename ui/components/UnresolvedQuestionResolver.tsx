// ============================================================
// R3-S7: UnresolvedQuestionResolver — 处理待确认问题
// 每个问题支持:选目标页面 / 选动作 / 标记无需处理 / 转备注。
// 处理后:更新 relatedInteraction 或创建 user interaction,
// 从队列移除(由 recalculate 重新生成,这里通过返回 updated interactions 体现)。
// ============================================================

import React, { useState } from 'react'
import type { AIContextPackage } from '@schema/package-schema'
import type { Interaction, ActionType } from '@schema/interaction'
import { ACTION_TYPE_OPTIONS, buildNaturalLanguage, RelationFormState } from './relation-form'
import { createStableInteractionId } from '@modules/utils/stable-id'

interface Props {
  pkg: AIContextPackage
  onResolve: (updatedInteractions: Interaction[]) => void
  // R3.1-3:标记问题"无需处理"(记入 dismissedQuestionIds,不再反复出现)
  onDismiss?: (questionId: string) => void
}

export function UnresolvedQuestionResolver({ pkg, onResolve, onDismiss }: Props) {
  const questions = pkg.interactionGraph.unresolvedQuestions || []
  const activePages = pkg.pageList.pages.filter(p => !p.excluded)
  const pageName = (id?: string) => pkg.pageList.pages.find(p => p.pageId === id)?.pageName || id || '?'

  // 每个问题的本地选择状态
  const [choices, setChoices] = useState<Record<string, { targetPageId: string; actionType: ActionType }>>({})

  const setChoice = (qid: string, patch: Partial<{ targetPageId: string; actionType: ActionType }>) => {
    setChoices(prev => {
      const current = prev[qid] || { targetPageId: '', actionType: 'navigate' as ActionType }
      return { ...prev, [qid]: { ...current, ...patch } }
    })
  }

  // 解决:更新关联关系 或 新建 user 关系
  const resolve = (q: typeof questions[number]) => {
    const choice = choices[q.id]
    if (!choice || !choice.targetPageId) return

    const interactions = [...pkg.interactionGraph.interactions]
    const targetPage = pkg.pageList.pages.find(p => p.pageId === choice.targetPageId)
    const targetType: RelationFormState['targetType'] =
      targetPage?.pageType === 'modal' || targetPage?.pageType === 'drawer' ? 'overlay' :
      targetPage?.pageType.startsWith('state_') ? 'state' : 'page'

    const applyTarget = (i: Interaction): Interaction => ({
      ...i,
      actionType: choice.actionType,
      targetType,
      targetPageId: targetType === 'page' ? choice.targetPageId : undefined,
      targetOverlayId: targetType === 'overlay' ? choice.targetPageId : undefined,
      targetStateId: targetType === 'state' ? choice.targetPageId : undefined,
      confidence: Math.max(i.confidence ?? 0, 0.9),
      source: Array.from(new Set([...(i.source || []), 'user'])) as Interaction['source'],
      confirmedByUser: true,
      userModified: true,
    })

    if (q.relatedInteractionId) {
      // 更新已有关系
      const idx = interactions.findIndex(i => i.id === q.relatedInteractionId)
      if (idx >= 0) {
        const updated = applyTarget(interactions[idx])
        updated.naturalLanguage = buildNL(updated, pkg)
        interactions[idx] = updated
        onResolve(interactions)
        return
      }
    }

    // 否则新建 user 关系
    const fromPage = q.relatedPage || activePages[0]?.pageId || ''
    const id = createStableInteractionId(fromPage, q.relatedElement, choice.actionType, choice.targetPageId)
    const newInter: Interaction = {
      id,
      interactionType: targetType === 'overlay' ? 'overlay' : targetType === 'state' ? 'state' : 'navigation',
      fromPage,
      triggerElement: q.relatedElement,
      triggerElementType: 'button',
      actionType: choice.actionType,
      targetType,
      targetPageId: targetType === 'page' ? choice.targetPageId : undefined,
      targetOverlayId: targetType === 'overlay' ? choice.targetPageId : undefined,
      targetStateId: targetType === 'state' ? choice.targetPageId : undefined,
      confidence: 1,
      source: ['user'],
      confirmedByUser: true,
      userModified: true,
      naturalLanguage: '',
    }
    newInter.naturalLanguage = buildNL(newInter, pkg)
    interactions.push(newInter)
    onResolve(interactions)
  }

  // 标记无需处理:
  // - 关联了关系 → 删除该不确定关系
  // - 无关联(如 q_zero_inter)→ 记入 dismissedQuestionIds,质量层不再反复生成
  const dismiss = (q: typeof questions[number]) => {
    if (q.relatedInteractionId) {
      onResolve(pkg.interactionGraph.interactions.filter(i => i.id !== q.relatedInteractionId))
    } else if (onDismiss) {
      onDismiss(q.id)
    }
  }

  return (
    <div className="question-resolver">
      {questions.map(q => {
        const choice = choices[q.id] || { targetPageId: '', actionType: 'navigate' as ActionType }
        return (
          <div key={q.id} className="question-card">
            <div className="question-text">{q.question}</div>
            {q.relatedPage && <div className="question-meta">关联页面:{pageName(q.relatedPage)}</div>}
            {q.suggestedOptions.length > 0 && (
              <div className="question-options">建议:{q.suggestedOptions.join(' / ')}</div>
            )}
            <div className="question-form">
              <select value={choice.actionType} onChange={e => setChoice(q.id, { actionType: e.target.value as ActionType })}>
                {ACTION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={choice.targetPageId} onChange={e => setChoice(q.id, { targetPageId: e.target.value })}>
                <option value="">— 选择目标页面 —</option>
                {activePages.map(p => <option key={p.pageId} value={p.pageId}>{p.pageName}</option>)}
              </select>
              <button className="mini active" disabled={!choice.targetPageId} onClick={() => resolve(q)}>确定</button>
              <button className="mini" onClick={() => dismiss(q)}>无需处理</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 用 Interaction 直接生成 naturalLanguage(resolver 内部用,避免依赖 form)
function buildNL(inter: Interaction, pkg: AIContextPackage): string {
  const pageName = (id?: string) => pkg.pageList.pages.find(p => p.pageId === id)?.pageName || id || '?'
  const from = pageName(inter.fromPage)
  const actionLabel = ACTION_TYPE_OPTIONS.find(a => a.value === inter.actionType)?.label || inter.actionType
  const targetId = inter.targetPageId || inter.targetOverlayId || inter.targetStateId
  const target = targetId ? pageName(targetId) : '目标未指定'
  return `当用户在【${from}】${inter.triggerElement ? `点击【${inter.triggerElement}】` : ''}时,执行【${actionLabel}】,目标为【${target}】。`
}
