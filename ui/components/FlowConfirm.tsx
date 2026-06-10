// ============================================================
// 页面流程确认组件(PRD §10.4 核心页面)
// 展示:主流程 + 挂载关系 + 待确认问题
// 操作:批量确认 / 修改 / 删除 / 处理待确认问题
// ============================================================

import React, { useState } from 'react'
import type { AIContextPackage } from '@schema/package-schema'
import type { Interaction } from '@schema/interaction'

interface Props {
  pkg: AIContextPackage
  onUpdate: (interactions: Interaction[]) => void
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

export function FlowConfirm({ pkg, onUpdate }: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>(pkg.interactionGraph.interactions)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const pageName = (pageId?: string) =>
    pkg.pageList.pages.find(p => p.pageId === pageId)?.pageName || pageId || '?'

  // 按置信度分组
  const high = interactions.filter(i => i.confidence >= 0.85)
  const medium = interactions.filter(i => i.confidence >= 0.6 && i.confidence < 0.85)
  const low = interactions.filter(i => i.confidence < 0.6)

  const unresolvedQuestions = pkg.interactionGraph.unresolvedQuestions || []

  // 0 关系空状态(审计 P0 / 10.2 / A15 / UX验收第2条:给原因+补救入口)
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
          <button onClick={() => setShowAddDialog(true)}>添加主流程</button>
          <button onClick={() => setShowAddDialog(true)}>添加页面跳转</button>
          <button onClick={() => setShowAddDialog(true)}>添加弹窗关系</button>
          <button onClick={() => setShowAddDialog(true)}>添加状态归属</button>
        </div>
        <p className="empty-hint">
          提示:你也可以先在 MasterGo 中添加原型连线(reactions),或规范图层命名,然后重新生成数据包。
        </p>
      </div>
    )
  }

  // 批量确认高置信度
  const confirmAllHigh = () => {
    const updated = interactions.map(i =>
      i.confidence >= 0.85 ? { ...i, confirmedByUser: true } : i
    )
    setInteractions(updated)
    onUpdate(updated)
  }

  // 确认单条
  const confirmOne = (id: string) => {
    const updated = interactions.map(i =>
      i.id === id ? { ...i, confirmedByUser: true } : i
    )
    setInteractions(updated)
    onUpdate(updated)
  }

  // 删除单条
  const deleteOne = (id: string) => {
    const updated = interactions.filter(i => i.id !== id)
    setInteractions(updated)
    onUpdate(updated)
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

      {/* 待确认问题队列 */}
      {pkg.interactionGraph.unresolvedQuestions.length > 0 && (
        <section className="flow-section">
          <h3>待确认问题 ({pkg.interactionGraph.unresolvedQuestions.length})</h3>
          {pkg.interactionGraph.unresolvedQuestions.map((q, idx) => (
            <div key={idx} className="question-card">
              <div className="question-text">{q.question}</div>
              {q.suggestedOptions.length > 0 && (
                <div className="question-options">
                  建议: {q.suggestedOptions.join(' / ')}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* 底部操作栏 */}
      <section className="flow-actions">
        <button onClick={() => setShowAddDialog(true)}>手动新增关系</button>
        <span className="action-hint">
          你可以补充插件未识别的页面跳转、弹窗、状态关系。
        </span>
      </section>
    </div>
  )
}
