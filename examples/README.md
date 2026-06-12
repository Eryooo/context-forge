# 样例数据包

本目录包含导出的样例数据包,展示 ContextForge 的实际输出格式。

## 文件说明

- `sample-package.json` — 完整 JSON 数据包(适合程序解析)
- `sample-package.prompt.txt` — AI Prompt 格式(适合直接发给 Claude / GPT)
- `sample-package.md` — Markdown 格式(人类可读)

## 使用方式

### 1. 发给 AI 生成代码

**Claude Code / Cursor / Codex**:
```bash
# 将 sample-package.prompt.txt 内容直接粘贴或作为上下文文件
```

**ChatGPT**:
- 复制 `sample-package.prompt.txt` 全文
- 粘贴到对话,补充需求:"基于上面的设计上下文,生成 React 项目"

### 2. 程序解析

```typescript
import pkg from './sample-package.json'

// 遍历页面
pkg.pages.forEach(page => {
  console.log(page.pageName, page.pageType, page.dsl)
})

// 分析交互关系
pkg.interactions.forEach(rel => {
  console.log(`${rel.fromPageId} → ${rel.targetPageId} (${rel.actionType})`)
})
```

## 真实项目导出

这些样例基于一个虚构的"待办事项管理 Web 应用"设计稿:
- 4 个页面:登录页、列表页、详情页、新增弹窗
- 6 个交互关系
- 包含 PRD 上下文和质量报告

你可以在 MasterGo 中用任意设计稿导出自己的数据包。
