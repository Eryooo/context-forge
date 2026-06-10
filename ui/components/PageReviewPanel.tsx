// ============================================================
// 页面识别结果确认页(审计 P1 / 10.2 / UX验收第3条)
// 用户可看到具体页面列表(而非数量),并改类型/重命名/排除/设入口页/恢复自动。
// 改动后重算 pageList/pageGraph/interactionGraph/qualityReport。
// ============================================================

import React, { useState } from 'react'
import type { PageNode } from '@schema/page-graph'
import type { PageType } from '@schema/page-graph'

interface Props {
  pages: PageNode[]
  onChange: (pages: PageNode[]) => void // 用户改动后回调,触发重算
}

// 页面分组(审计 10.2:分组展示更清晰)
function groupPages(pages: PageNode[]) {
  const main = pages.filter(p => ['entry', 'home', 'list', 'detail', 'form'].includes(p.pageType))
  const overlays = pages.filter(p => ['modal', 'drawer'].includes(p.pageType))
  const states = pages.filter(p => p.pageType.startsWith('state_'))
  const components = pages.filter(p => p.pageType === 'component')
  const unknowns = pages.filter(p => p.pageType === 'unknown')
  return { main, overlays, states, components, unknowns }
}

export function PageReviewPanel({ pages, onChange }: Props) {
  const [localPages, setLocalPages] = useState<PageNode[]>(pages)
  const groups = groupPages(localPages)

  const updatePage = (pageId: string, patch: Partial<PageNode>) => {
    const updated = localPages.map(p => (p.pageId === pageId ? { ...p, ...patch } : p))
    setLocalPages(updated)
    onChange(updated) // 触发重算
  }

  const renderPageCard = (page: PageNode) => (
    <div key={page.pageId} className="page-card">
      <div className="page-head">
        <input
          className="page-name-edit"
          value={page.pageName}
          onChange={(e) => updatePage(page.pageId, { pageName: e.target.value })}
        />
        <span className="page-conf">{(page.typeConfidence * 100).toFixed(0)}%</span>
      </div>
      <div className="page-meta">
        <label>
          类型:
          <select
            value={page.pageType}
            onChange={(e) => updatePage(page.pageId, { pageType: e.target.value as PageType })}
          >
            <option value="entry">入口页</option>
            <option value="home">首页</option>
            <option value="list">列表页</option>
            <option value="detail">详情页</option>
            <option value="form">表单页</option>
            <option value="modal">弹窗</option>
            <option value="drawer">抽屉</option>
            <option value="state_empty">空状态</option>
            <option value="state_loading">加载状态</option>
            <option value="state_error">错误状态</option>
            <option value="state_success">成功状态</option>
            <option value="component">组件</option>
            <option value="unknown">未知</option>
          </select>
        </label>
        <label>
          数据: DSL:{statusIcon(page.dslStatus)} HTML:{statusIcon(page.htmlStatus)} 截图:{statusIcon(page.screenshotStatus)}
        </label>
      </div>
      <div className="page-actions">
        <button className="mini" onClick={() => updatePage(page.pageId, { isEntryPage: !page.isEntryPage })}>
          {page.isEntryPage ? '✓ 入口页' : '设为入口页'}
        </button>
        <button className="mini" onClick={() => updatePage(page.pageId, { excluded: !page.excluded })}>
          {page.excluded ? '恢复' : '排除'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="page-review">
      <section>
        <h3>主页面 ({groups.main.length})</h3>
        {groups.main.map(renderPageCard)}
      </section>

      <section>
        <h3>弹窗 / 抽屉 ({groups.overlays.length})</h3>
        {groups.overlays.map(renderPageCard)}
      </section>

      <section>
        <h3>状态页 ({groups.states.length})</h3>
        {groups.states.map(renderPageCard)}
      </section>

      <section>
        <h3>组件素材 ({groups.components.length})</h3>
        {groups.components.map(renderPageCard)}
      </section>

      {groups.unknowns.length > 0 && (
        <section>
          <h3>未归属 ({groups.unknowns.length})</h3>
          {groups.unknowns.map(renderPageCard)}
        </section>
      )}
    </div>
  )
}

function statusIcon(status: string): string {
  if (status === 'success') return '✓'
  if (status === 'fallback') return '⚠'
  return '✗'
}
