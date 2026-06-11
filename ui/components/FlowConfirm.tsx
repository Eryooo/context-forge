// ============================================================
// 页面流程确认组件(PRD §10.4 核心页面)
// 展示:主流程 + 挂载关系 + 待确认问题
// 操作:批量确认 / 修改 / 删除 / 处理待确认问题
// ============================================================

import React, { useState } from 'react'
import type { AIContextPackage } from '@schema/package-schema'
import type { Interaction } from '@schema/interaction'
import { AddRelationDialog } from './AddRelationDialog'
import { RelationEditor } from './RelationEditor'
import { UnresolvedQuestionResolver } from './UnresolvedQuestionResolver'
import type { RelationFormState } from './relation-form'

interface Props {
  pkg: AIContextPackage
  onUpdate: (interactions: Interaction[]) => void
  // R3.1-3:标记问题"无需处理"(走 recalculate dismissQuestionId)
  onDismissQuestion?: (questionId: string) => void
}

// 置信度颜色
function confColor(conf: number): string {
  if (conf >= 0.85) return 'var(--success)'
  if (conf >= 0.6) return 'var(--warning)'
  return 'var(--error)'
}

function confLabel(conf: number): string {
  if (conf >= 0.85) return '高'
  if (conf >= 0.6) return '中'
  return '低'
}

export function FlowConfirm({ pkg, onUpdate, onDismissQuestion }: Props) {
  // R3-S5 修复:不再用本地 useState 缓存 interactions(pkg 重算后会脱节)。
  // 直接读 pkg,所有变更经 onUpdate 上抛触发重算,pkg 回流刷新视图。
  const interactions = pkg.interactionGraph.interactions
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addPreset, setAddPreset] = useState<Partial<RelationFormState> | undefined>(undefined)
  const [editingId, setEditingId] = useState<string | null>(null)

  const pageName = (pageId?: string) =>
    pkg.pageList.pages.find(p => p.pageId === pageId)?.pageName || pageId || '?'

  // 按置信度分组
  const high = interactions.filter(i => i.confidence >= 0.85)
  const medium = interactions.filter(i => i.confidence >= 0.6 && i.confidence < 0.85)
  const low = interactions.filter(i => i.confidence < 0.6)

  const unresolvedQuestions = pkg.interactionGraph.unresolvedQuestions || []

  // 打开新增对话框(可带预设,如"添加弹窗关系")
  const openAdd = (preset?: Partial<RelationFormState>) => {
    setAddPreset(preset)
    setShowAddDialog(true)
  }

  // 新增关系提交
  const handleAddSubmit = (inter: Interaction) => {
    setShowAddDialog(false)
    setAddPreset(undefined)
    onUpdate([...interactions, inter])
  }

  // 编辑关系提交
  const handleEditSubmit = (inter: Interaction) => {
    setEditingId(null)
    onUpdate(interactions.map(i => (i.id === inter.id ? inter : i)))
  }

  // 待确认问题处理:更新某条关系或新增 user 关系
  const handleQuestionResolve = (updated: Interaction[]) => {
    onUpdate(updated)
  }

  // 0 关系空状态(审计 P0 / 10.2 / A15:给原因+补救入口)
  if (interactions.length === 0) {
    return (
      <div className="flow-confirm-empty">
        <h3>暂未识别到页面关系</h3>
        <p className="empty-reason">可能原因:</p>
        <ul className="empty-reasons">
          <li>1. 选中的页面中没有明显按钮 / 链接 / 列表项;</li>
          <li>2. 图层命名不包含"新增 / 编辑 / 查看 / 返回 / 提交"等关键词;</li>
          <li>3. 页面之间没有 MasterGo 原型连线;</li>
          <li>4. 当前只完成页面识别,尚未确认页面流程。</li>
        </ul>
        <p className="empty-actions-label">你可以:</p>
        <div className="empty-actions">
          <button onClick={() => openAdd({ interactionType: 'navigation', actionType: 'navigate', targetType: 'page' })}>添加页面跳转</button>
          <button onClick={() => openAdd({ interactionType: 'overlay', actionType: 'openModal', targetType: 'overlay' })}>添加弹窗关系</button>
          <button onClick={() => openAdd({ interactionType: 'state', actionType: 'showState', targetType: 'state' })}>添加状态归属</button>
        </div>
        <p className="empty-hint">
          提示:你也可以先在 MasterGo 中添加原型连线(reactions),或规范图层命名,然后重新生成数据包。
        </p>
        {showAddDialog && (
          <AddRelationDialog
            pages={pkg.pageList.pages}
            preset={addPreset}
            onSubmit={handleAddSubmit}
            onCancel={() => setShowAddDialog(false)}
          />
        )}
      </div>
    )
  }

  // 批量确认高置信度
  const confirmAllHigh = () => {
    onUpdate(interactions.map(i => (i.confidence >= 0.85 ? { ...i, confirmedByUser: true } : i)))
  }

  // 确认单条
  const confirmOne = (id: string) => {
    onUpdate(interactions.map(i => (i.id === id ? { ...i, confirmedByUser: true } : i)))
  }

  // 删除单条
  const deleteOne = (id: string) => {
    onUpdate(interactions.filter(i => i.id !== id))
  }

  const renderCard = (inter: Interaction) => (
    <div key={inter.id} className="rel-card">
      <div className="rel-head">
        <span className="rel-conf" style={{ color: confColor(inter.confidence) }}>
          {confLabel(inter.confidence)} ({(inter.confidence * 100).toFixed(0)}%)
        </span>
        <span className="rel-type">{inter.interactionType}</span>
        {inter.confirmedByUser && <span className="rel-confirmed">✓ 已确认</span>}
      </div>
      <div className="rel-desc">{inter.naturalLanguage}</div>
      <div className="rel-meta">
        来源: {inter.source.join(' + ')}
        {inter.evidence && ` · ${inter.evidence}`}
      </div>
      <div className="rel-actions">
        {!inter.confirmedByUser && (
          <button className="mini" onClick={() => confirmOne(inter.id)}>确认</button>
        )}
        <button className="mini" onClick={() => setEditingId(inter.id)}>编辑</button>
        <button className="mini danger" onClick={() => deleteOne(inter.id)}>删除</button>
      </div>
    </div>
  )

  return (
    <div className="flow-confirm">
      {/* 主流程 */}
      <section className="flow-section">
        <h3>主流程</h3>
        <div className="flow-chain">
          {pkg.pageGraph.mainFlow.map((pid, idx) => (
            <React.Fragment key={pid}>
              <span className="flow-node">{pageName(pid)}</span>
              {idx < pkg.pageGraph.mainFlow.length - 1 && <span className="flow-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* 挂载关系(分组) */}
      <section className="flow-section">
        <h3>挂载关系</h3>
        {pkg.pageGraph.pageGroups.map((group, idx) => (
          <div key={idx} className="group">
            <div className="group-base">{pageName(group.basePage)}</div>
            {group.children.length > 0 ? (
              <ul className="group-children">
                {group.children.map(child => (
                  <li key={child.pageId}>
                    {child.relationType === 'overlay' ? '🪟' : '📄'} {pageName(child.pageId)}
                    <span className="child-type">({child.relationType})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="group-empty">无挂载子页面</div>
            )}
          </div>
        ))}
      </section>

      {/* 高置信度关系(批量确认) */}
      {high.length > 0 && (
        <section className="flow-section">
          <div className="section-head">
            <h3>高置信度关系 ({high.length})</h3>
            <button className="mini" onClick={confirmAllHigh}>批量确认</button>
          </div>
          {high.map(renderCard)}
        </section>
      )}

      {/* 中置信度关系(逐条确认) */}
      {medium.length > 0 && (
        <section className="flow-section">
          <h3>中置信度关系 ({medium.length}) — 建议核对</h3>
          {medium.map(renderCard)}
        </section>
      )}

      {/* 低置信度 + 待确认问题 */}
      {low.length > 0 && (
        <section className="flow-section">
          <h3>低置信度关系 ({low.length}) — 需确认</h3>
          {low.map(renderCard)}
        </section>
      )}

      {/* 待确认问题队列(R3-S7:可处理)*/}
      {unresolvedQuestions.length > 0 && (
        <section className="flow-section">
          <h3>待确认问题 ({unresolvedQuestions.length})</h3>
          <UnresolvedQuestionResolver
            pkg={pkg}
            onResolve={handleQuestionResolve}
            onDismiss={onDismissQuestion}
          />
        </section>
      )}

      {/* 底部操作栏 */}
      <section className="flow-actions">
        <button onClick={() => openAdd()}>手动新增关系</button>
        <span className="action-hint">
          你可以补充插件未识别的页面跳转、弹窗、状态关系。
        </span>
      </section>

      {/* 新增关系对话框 */}
      {showAddDialog && (
        <AddRelationDialog
          pages={pkg.pageList.pages}
          preset={addPreset}
          onSubmit={handleAddSubmit}
          onCancel={() => setShowAddDialog(false)}
        />
      )}

      {/* 编辑关系对话框 */}
      {editingId && (
        <RelationEditor
          pages={pkg.pageList.pages}
          interaction={interactions.find(i => i.id === editingId)!}
          onSubmit={handleEditSubmit}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  )
}
