// ============================================================
// R3-S5/S6: 关系表单共享逻辑
// AddRelationDialog(新增)和 RelationEditor(编辑)共用:
// - 表单字段定义
// - naturalLanguage 自动生成
// - target 字段按 targetType 归一
// ============================================================

import type { Interaction, InteractionType, ActionType, TriggerElementType } from '@schema/interaction'
import type { PageNode } from '@schema/page-graph'
import { createStableInteractionId } from '@modules/utils/stable-id'

export type TargetType = 'page' | 'overlay' | 'state' | 'external' | 'self' | 'unknown'

// 关系表单的可编辑字段(AddRelationDialog / RelationEditor 共用)
export interface RelationFormState {
  fromPage: string
  triggerElement: string
  triggerElementType: TriggerElementType
  interactionType: InteractionType
  actionType: ActionType
  targetType: TargetType
  targetPageId: string
  targetOverlayId: string
  targetStateId: string
  returnToPageId: string
  condition: string
  expectedState: string
  failureState: string
}

export const DEFAULT_RELATION_FORM: RelationFormState = {
  fromPage: '',
  triggerElement: '',
  triggerElementType: 'button',
  interactionType: 'navigation',
  actionType: 'navigate',
  targetType: 'page',
  targetPageId: '',
  targetOverlayId: '',
  targetStateId: '',
  returnToPageId: '',
  condition: '',
  expectedState: '',
  failureState: '',
}

// 动作类型选项
export const ACTION_TYPE_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'navigate', label: '跳转页面' },
  { value: 'openModal', label: '打开弹窗' },
  { value: 'openDrawer', label: '打开抽屉' },
  { value: 'closeModal', label: '关闭弹窗' },
  { value: 'closeDrawer', label: '关闭抽屉' },
  { value: 'showState', label: '展示状态' },
  { value: 'submitForm', label: '提交表单' },
  { value: 'goBack', label: '返回上级' },
  { value: 'refresh', label: '刷新当前' },
  { value: 'unknown', label: '未知' },
]

export const INTERACTION_TYPE_OPTIONS: { value: InteractionType; label: string }[] = [
  { value: 'navigation', label: '页面跳转' },
  { value: 'overlay', label: '浮层(弹窗/抽屉)' },
  { value: 'state', label: '状态变体' },
  { value: 'process', label: '业务流程' },
]

export const TRIGGER_TYPE_OPTIONS: { value: TriggerElementType; label: string }[] = [
  { value: 'button', label: '按钮' },
  { value: 'link', label: '链接' },
  { value: 'icon', label: '图标' },
  { value: 'listItem', label: '列表项' },
  { value: 'formSubmit', label: '表单提交' },
  { value: 'closeIcon', label: '关闭图标' },
  { value: 'backButton', label: '返回按钮' },
  { value: 'tab', label: '标签页' },
  { value: 'unknown', label: '未知' },
]

const pageName = (pages: PageNode[], id?: string) =>
  pages.find(p => p.pageId === id)?.pageName || id || '?'

// 根据 targetType 取目标 ID
function resolveTargetId(form: RelationFormState): string | undefined {
  switch (form.targetType) {
    case 'page': return form.targetPageId || undefined
    case 'overlay': return form.targetOverlayId || undefined
    case 'state': return form.targetStateId || undefined
    default: return undefined
  }
}

// 生成 naturalLanguage 描述
export function buildNaturalLanguage(form: RelationFormState, pages: PageNode[]): string {
  const from = pageName(pages, form.fromPage)
  const actionLabel = ACTION_TYPE_OPTIONS.find(a => a.value === form.actionType)?.label || form.actionType
  const targetId = resolveTargetId(form)
  const target = targetId ? pageName(pages, targetId) : '目标未指定'
  return `当用户在【${from}】${form.triggerElement ? `点击【${form.triggerElement}】` : ''}时,执行【${actionLabel}】,目标为【${target}】。`
}

// 表单 → Interaction(新增或编辑)
// isNew=true 走 S5 新增逻辑(confidence=1, source=['user']);
// isNew=false 走 S6 编辑逻辑(基于已有关系,source 追加 user, confidence≥0.9)
export function formToInteraction(
  form: RelationFormState,
  pages: PageNode[],
  base?: Interaction
): Interaction {
  const targetId = resolveTargetId(form)
  const id = base?.id || createStableInteractionId(
    form.fromPage,
    form.triggerElement,
    form.actionType,
    targetId
  )

  // source 处理
  let source: Interaction['source']
  if (base) {
    // 编辑:在原 source 基础上追加 'user'(去重)
    source = Array.from(new Set([...(base.source || []), 'user'])) as Interaction['source']
  } else {
    source = ['user']
  }

  // confidence:新增=1;编辑=max(原值, 0.9)
  const confidence = base ? Math.max(base.confidence ?? 0, 0.9) : 1

  return {
    id,
    interactionType: form.interactionType,
    fromPage: form.fromPage,
    triggerElement: form.triggerElement || undefined,
    triggerElementType: form.triggerElementType,
    actionType: form.actionType,
    targetType: form.targetType,
    targetPageId: form.targetType === 'page' ? (form.targetPageId || undefined) : undefined,
    targetOverlayId: form.targetType === 'overlay' ? (form.targetOverlayId || undefined) : undefined,
    targetStateId: form.targetType === 'state' ? (form.targetStateId || undefined) : undefined,
    returnToPageId: form.returnToPageId || undefined,
    condition: form.condition || undefined,
    expectedState: form.expectedState || undefined,
    failureState: form.failureState || undefined,
    confidence,
    source,
    evidence: base?.evidence,
    confirmedByUser: true,
    userModified: true,
    naturalLanguage: buildNaturalLanguage(form, pages),
  }
}

// Interaction → 表单(编辑时回填)
export function interactionToForm(inter: Interaction): RelationFormState {
  return {
    fromPage: inter.fromPage,
    triggerElement: inter.triggerElement || '',
    triggerElementType: inter.triggerElementType || 'button',
    interactionType: inter.interactionType,
    actionType: inter.actionType,
    targetType: inter.targetType || 'page',
    targetPageId: inter.targetPageId || '',
    targetOverlayId: inter.targetOverlayId || '',
    targetStateId: inter.targetStateId || '',
    returnToPageId: inter.returnToPageId || '',
    condition: inter.condition || '',
    expectedState: inter.expectedState || '',
    failureState: inter.failureState || '',
  }
}
