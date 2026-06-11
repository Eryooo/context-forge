// ============================================================
// 交互关系 Schema — 4 类关系(navigation/overlay/state/process)
// ============================================================

// 4 类交互关系(PRD §8 定义)
export type InteractionType =
  | 'navigation'  // 真实页面跳转(A → B)
  | 'overlay'     // 弹窗/抽屉/浮层(打开/关闭)
  | 'state'       // 状态变体(空/加载/错误/成功)
  | 'process'     // 业务流程(多步骤)

// 动作类型
export type ActionType =
  | 'navigate'      // 跳转到另一页
  | 'openModal'     // 打开弹窗
  | 'openDrawer'    // 打开抽屉
  | 'closeModal'    // 关闭弹窗
  | 'closeDrawer'   // 关闭抽屉
  | 'showState'     // 展示状态页
  | 'submitForm'    // 提交表单
  | 'goBack'        // 返回上一页
  | 'refresh'       // 刷新当前页
  | 'unknown'       // 未知动作

// 触发元素类型
export type TriggerElementType =
  | 'button'
  | 'link'
  | 'icon'
  | 'listItem'
  | 'formSubmit'
  | 'closeIcon'
  | 'backButton'
  | 'tab'
  | 'unknown'

// 单条交互关系(审计 4.6/4.7/7.3 改造:target 拆分+source 数组+返回目标)
export interface Interaction {
  id: string                    // 唯一 ID(审计 7.2:用 stable-id.ts 哈希生成)
  interactionType: InteractionType

  // 来源
  fromPage: string              // 来源页面 ID
  triggerElement?: string       // 触发元素名称(e.g. "新增按钮")
  triggerElementType?: TriggerElementType

  // 动作
  actionType: ActionType

  // 目标(审计 4.6:拆分细化,避免混乱)
  targetType?: 'page' | 'overlay' | 'state' | 'external' | 'self' | 'unknown'
  targetPageId?: string         // 目标页面 ID(navigate/showState)
  targetOverlayId?: string      // 目标弹窗/抽屉 ID(openModal/openDrawer)
  targetStateId?: string        // 目标状态页 ID(showState)
  targetExternalUrl?: string    // 外部链接(跳转外站)
  returnToPageId?: string       // closeModal/goBack/关闭弹窗后返回的页面 ID(审计 7.3)
  overlayOwnerPageId?: string   // overlay 所属的主页面 ID(审计 7.3)

  // 条件与结果
  condition?: string            // 触发条件(e.g. "用户点击新增按钮")
  expectedState?: string        // 预期结果(e.g. "打开新增任务弹窗")
  failureState?: string         // 失败状态(e.g. "提交失败,显示错误 Toast")

  // 置信度(由规则/AI/原型推断,0–1)
  confidence: number

  // 推断来源(审计 4.5:改为数组,支持多来源叠加,如 rule+prototype / rule+prd)
  source: Array<'rule' | 'ai' | 'prototype' | 'prd' | 'user' | 'naming' | 'layout'>
  evidence?: string             // 证据(e.g. "reactions.action.destinationId=xxx")

  // 用户确认状态
  confirmedByUser: boolean
  userModified: boolean         // 用户是否修改过

  // 自然语言描述(用于关系卡片编辑页展示)
  naturalLanguage: string       // e.g. "当用户在【任务列表页】点击【新增按钮】时,执行【打开弹窗】,目标为【新增任务弹窗】。"
}

// 待确认问题(低置信度关系进入此队列)
export interface UnresolvedQuestion {
  id: string
  question: string              // e.g. "点击提交后应该返回列表页还是进入详情页?"
  relatedPage?: string          // 关联页面
  relatedElement?: string       // 关联元素
  suggestedOptions: string[]    // 建议选项(供用户快速选)
  relatedInteractionId?: string // 如果是某条交互关系不确定,记录其 ID
}

// 交互关系集合
export interface InteractionGraph {
  interactions: Interaction[]
  unresolvedQuestions: UnresolvedQuestion[]

  // R3.1-3:用户点"无需处理"标记的问题 id,质量层不再重复生成这些问题
  dismissedQuestionIds?: string[]

  // 统计
  totalInteractions: number
  highConfidenceCount: number   // ≥0.85
  mediumConfidenceCount: number // 0.6–0.84
  lowConfidenceCount: number    // <0.6
  userConfirmedCount: number
}
