# ContextForge R3 Iteration Plan — 执行记录

**R3 目标**: 补全 R2 半闭环 → 设计师可用 MVP

**核心边界**(不可越):
- 插件只负责读取、识别、推断、确认、打包、导出设计上下文数据
- 不生成 HTML / React / Vue
- 不运行原型
- 外部 AI 工具(Claude Code / Codex / Cursor / ChatGPT)基于 ContextForge 导出的数据包生成 HTML Demo

---

## 执行顺序(15 Steps)

### P0 核心闭环(S1-S8)

- [  ] **S1**(#16): 重构导出链路 — 导出当前 pkg,不再重新生成
  - 新增 `EXPORT_CURRENT_PACKAGE` 消息
  - UI 传当前 pkg + format + includeRawPRD + targetTool
  - 主线程只做 sanitize + applyRawPRDPolicy + exportPackage
  - 验收:用户改类型/删关系/新增关系后导出与 UI 一致

- [  ] **S2**(#17): 扩展 PageNode — 入口页 + 排除
  - PageNode 加 `isEntryPage?` / `excluded?`
  - PageReviewPanel 启用"设为入口页"(单选)/"排除/恢复"
  - excluded 不进 mainFlow / interaction target / 导出 pages
  - isEntryPage 优先于自动识别

- [  ] **S3**(#18): 新增 rebuildPageGraph
  - 新建 `src/modules/page-graph/rebuild.ts`
  - `rebuildPageGraph(pages, interactions): PageGraph`
  - 完整重建 entryPage / mainFlow / pageGroups / 各 count

- [  ] **S4**(#19): 重构 recalculatePackage
  - 改名+签名:`recalculatePackage(pkg, input: {pages?, interactions?, prdContext?})`
  - 调 rebuildPageGraph,禁止只局部更新 pageGroups

- [  ] **S5**(#20): 实现 AddRelationDialog
  - 新建 `ui/components/AddRelationDialog.tsx`
  - 字段:fromPage / triggerElement / actionType / target* / condition / expectedState / failureState
  - 提交生成 Interaction(confidence=1, source=['user'], confirmed/modified=true)

- [  ] **S6**(#21): 实现 RelationEditor
  - 新建 `ui/components/RelationEditor.tsx`
  - 每张 RelationCard 加"编辑"按钮
  - 编辑来源/触发/动作/目标/成功/失败/备注,保存后 source 追加 user

- [  ] **S7**(#22): 实现 UnresolvedQuestionResolver
  - 新建 `ui/components/UnresolvedQuestionResolver.tsx`
  - 每问题支持选建议项/选目标/选动作/标记无需/转备注
  - 处理后更新 interaction 或创建 user interaction,重算质量

- [  ] **S8**(#23): 移除 quality-checker 副作用
  - runQualityChecks 纯函数化,不修改 pkg
  - zero-interaction 问题输出到 qualityReport.unresolvedQuestions
  - 写回 interactionGraph 由 recalculatePackage 显式 merge

### P1 完善(S9-S14)

- [  ] **S9**(#24): 扩展 deep-summary 到 summary
  - summary 加 componentStats? / scanStats?
  - keyElements 和 hasInteraction 必须来自 deep summary

- [  ] **S10**(#25): 修复体积评估
  - 拆分 estimatePromptTokens(prompt) / estimateJsonPackageSize(pkg) / estimateAssetSize(pkg.assets)
  - 不用含 base64 的 JSON 估算 Prompt token

- [  ] **S11**(#26): 修复 rawPRD include 逻辑
  - EXPORT_CURRENT_PACKAGE 传 includeRawPRD
  - applyRawPRDPolicy 控制
  - 验收:未勾选无 rawPRD,勾选有,草稿永不含

- [  ] **S12**(#27): 导出目标工具选择
  - ExportPanel 加目标工具选择(Claude Code / Codex / Cursor / ChatGPT / Generic)
  - 写入 pkg.aiExecutionInstruction.targetTool
  - 生成对应 Prompt 标题和使用说明

- [  ] **S13**(#28): 质量面板分项评分
  - 新增分项:数据完整度 / 页面确认度 / 交互完整度 / PRD 完整度 / 导出可用性
  - 页面>1 且交互=0 时交互完整度必须低分

- [  ] **S14**(#29): 导出风险 gating + AI key + probe 修正
  - 导出风险 gating(blocking>0 禁用推荐导出+提供仍然导出;warning>0 谨慎提示)
  - AI settings key 改 `context-forge:ai-settings` + 版本号
  - DevMode probe 同时尝试 mg.document.currentPage.selection 和 mg.currentPage.selection

### 交付(S15)

- [  ] **S15**(#30): 文档同步 + typecheck + build + 交付
  - 更新 README / USER-GUIDE / EXECUTION-SUMMARY / PRD-TRACEABILITY / quality-metrics / capability-report
  - 删本地路径 / 旧 Step8-10 描述 / Figma 误导 / 尾随空格
  - package.json name → context-forge,manifest name → ContextForge
  - typecheck + build + 交付报告 + push

---

## R3 验收标准

### 数据一致性
- [ ] 页面编辑后导出结果一致
- [ ] 关系编辑后导出结果一致
- [ ] 新增关系后导出结果一致
- [ ] 删除关系后导出结果一致
- [ ] 处理 unresolved 后导出结果一致

### 产品闭环
- [ ] 用户能从 0 关系状态手动添加主流程
- [ ] 用户能设入口页
- [ ] 用户能排除页面
- [ ] 用户能处理待确认问题
- [ ] 用户能补 PRD
- [ ] 用户能看到风险
- [ ] 用户能导出确认后的最终包

### 安全
- [ ] API Key 不进 JSON / Prompt / Markdown / console / debug snapshot
- [ ] rawPRD 默认不进草稿,导出受开关控制

### 工程
- [ ] npm run typecheck 通过
- [ ] npm run build 通过
- [ ] 无死代码模块
- [ ] 无占位按钮
- [ ] 无发了没人接的消息
- [ ] 无 UI 暗示但不可用的功能

---

## 执行记录

### Step 1 — 重构导出链路(导出当前 pkg)
**开始时间**: 2026-06-11  
**状态**: 进行中  
**文件**: messages/sender.ts, ui/App.tsx, lib/main.ts, src/modules/exporter.ts
