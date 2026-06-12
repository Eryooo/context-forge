# Changelog

本项目所有重要变更记录于此。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 计划中
- AI 增强能力真正接入(页面语义/关系推断/PRD 摘要)
- Claude Code 专用文件包导出
- ZIP 数据包导出
- 历史记录与版本管理
- Figma 平台适配
- 设计变更 diff

---

## [0.3.1] - 2026-06-11 — R3.1 验收补丁

### 修复
- **excluded 页面全链路移除**:排除的页面不再出现在 JSON / Prompt / Markdown / assets / interactions 中(`stripExcludedPages`)
- **导出链路防丢编辑**:废弃旧 `EXPORT → quickExport` 默认路径,正式导出只走 `EXPORT_CURRENT_PACKAGE`,导出用户确认后的当前数据包
- **待确认问题去重**:新增 `dismissedQuestionIds`,用户点"无需处理"后相同问题不再反复出现
- **PageReviewPanel 受控同步**:`useEffect` 同步父级 pages,避免本地状态与数据包脱节
- **窗口尺寸**:520×720 → 960×760,适配各确认面板
- **CSS 全量修复**:补齐主布局 + 32 个组件 class 样式(R3 重写后样式缺失导致 UI 裸排)
- **调试面板恢复**:R3 重写时丢失的诊断面板入口
- **React Error Boundary**:防组件渲染错误导致白屏

### 清理
- 移除 5 个死消息(PING/PONG/EXPORT/RUN_PROBES/PROBE_RESULTS)与废弃的 `quickExport`

### 文档
- 统一 "7-Step" → "8 阶段";Figma 标记为 roadmap;命名统一 ContextForge / context-forge

---

## [0.3.0] - 2026-06-10 — R3 MVP 闭环

### 新增
- **导出当前数据包**:导出用户确认/编辑后的状态,所见即所得
- **手动新增关系**(AddRelationDialog):0 关系时可手动补充主流程
- **编辑关系**(RelationEditor):修改来源/触发/动作/目标/成功失败状态
- **处理待确认问题**(UnresolvedQuestionResolver):选目标/动作,转为确认关系
- **入口页 / 排除页面**:PageNode 支持 `isEntryPage` / `excluded`
- **完整重建页面图谱**(rebuildPageGraph):页面/关系编辑后完整重算
- **质量分项评分**:数据完整度 / 页面确认度 / 交互完整度 / PRD 完整度 / 导出可用性
- **导出风险 gating**:阻断性问题禁用导出,警告项提示
- **导出目标工具选择**:Claude Code / Codex / Cursor / ChatGPT / Generic,生成对应说明
- **深层结构扫描**(deep-summary):maxDepth 6 / maxNodes 1000
- **DevMode codegen 探测**入口

### 变更
- `quality-checker` 纯函数化,移除对入参的副作用
- Interaction `source` 改为数组(rule/ai/prototype/prd/user/naming/layout)
- Interaction `target` 拆分为 targetPageId / targetOverlayId / targetStateId / returnToPageId
- 交互关系 ID 改用哈希稳定生成(替代 Date.now + Math.random)
- 页面类型识别加优先级(state_* > modal/drawer > entry/home/list/detail/form > component > unknown)
- 体积评估拆分(剥离 base64,避免误报过长)

---

## [0.2.0] - 2026-06-09 — R2 安全 + 质量 + 流程化

### 新增
- 7/8 阶段流程化 UI 框架
- PRD 补充面板、AI 设置面板、页面识别结果页
- 18 项质量检查 + 评分
- Prompt 增强(边界声明 / 待确认问题 / 资产说明)

### 安全
- **API Key 不进数据包**:删除 `aiSettings` 字段,改为非敏感的 `aiEnhancement`
- 导出前双保险脱敏(`sanitizePackageForExport` + `redactSensitive`)
- console 转发前脱敏;rawPRD 默认不进草稿
- JSON 内联真实资产(DSL / HTML / 截图 base64)

---

## [0.1.0] - 2026-06-09 — R1 MVP 基础

### 新增
- MasterGo 插件工程骨架(TypeScript + React + Vite)
- 选区读取、节点树遍历、样式/文本采集
- 14 种页面类型识别
- 交互关系推断(命名规则 + 原型连线)
- DSL / HTML / 截图三层降级采集
- 导出 JSON / Prompt / Markdown
- MasterGo API 能力探测报告(capability-report.md)
