# ContextForge MVP 迭代执行计划(第二轮)

> 本计划严格依据三份审计文档生成:《ContextForge 审计报告》《体验问题补充审计报告》《下一轮完整迭代说明｜Claude Code 执行版》。
> **执行纪律:严格按 Step 顺序;每步完成 typecheck;不偏不漏不擅自加功能;遇阻如实标注。**
> 状态图例:⬜ 待办 / 🔄 进行中 / ✅ 完成 / ⏸️ 受阻

---

## 0. 不可逾越的边界(贯穿全程)

| # | 红线 | 落地检查点 |
|---|---|---|
| B1 | 不生成 HTML / React / Vue / 不运行原型 | 全程无代码生成逻辑 |
| B2 | 不接完整 AI 自动代码链路 | AI 仅做设置闭环,增强后置 |
| B3 | **API Key 绝不进入** 导出包/Prompt/MD/console/debug/history | sanitize + redact 双保险,验收逐项查 |
| B4 | **rawPRD 默认不进历史记录** | PRD 草稿存储排除 rawPRD,导出由用户勾选 |
| B5 | **debug 面板发版态默认隐藏** | 加 DEV 开关,默认折叠/隐藏 |
| B6 | **截图 base64 不进 Prompt** | 仅进 JSON.assets;Prompt 只写位置说明 |
| B7 | HTML/DSL 失败不阻断主流程 | 降级标记,不 throw |

---

## 1. 状态盘点结论(已核实,审计指控 100% 命中)

| 编号 | 审计问题 | 代码现状(已核实) | 等级 |
|---|---|---|---|
| A1 | AIContextPackage 含 aiSettings | `package-schema.ts:75 aiSettings?: AISettings` | P0 |
| A2 | 导出无脱敏 | `exporter.ts:226 JSON.stringify(pkg)`;`:31` 读 pkg.aiSettings | P0 |
| A3 | assets 未注入包 | dsl/html/screenshotsMap 仅在 orchestrator 局部,未进 pkg | P0 |
| A4 | prdContext/aiSettings 硬编码 null | `App.tsx:101-102,117-118` | P0 |
| A5 | source 单值 | `interaction.ts:62` 单值联合 | P1 |
| A6 | interaction id 不稳定 | `relation-inference.ts:176/249/294/322` Date.now+random | P1 |
| A7 | 页面类型无优先级 | `page-identifier.ts:37` Object.entries 遍历,form 抢 modal | P1 |
| A8 | 摘要只扫顶层 | `page-identifier.ts:168 node.children` 单层 | P1 |
| A9 | FlowConfirm 只能确认/删除 | 无 RelationEditor/AddRelation/QuestionResolver | P0 |
| A10 | 用户编辑后不重算质量 | 无 recalculate 函数 | P0 |
| A11 | 截图缺失恒 blocking | `quality-checker.ts:114 severity:'blocking'` 无条件 | P1 |
| A12 | 0 关系仍可高分 | `quality-report.ts:64` 评分不看交互完整度 | P0(UX) |
| A13 | console 转发未脱敏 | `lib/main.ts:182` 直接转发 | P0 |
| A14 | UI 是调试面板 | App.tsx 305 行单页堆叠,顶部 canvas?/build-probe | P0(UX) |
| A15 | 无 PRD/AI设置/页面确认 入口 | 组件缺失 | P0 |
| A16 | DevMode codegen 未实测 | capability-report §6.2 占位 | P1 |

---

## 2. 执行步骤(严格按序,对应审计 Step 1-14 + UX 重构)

### Step 1 — Schema 安全重构 [P0] ⬜
**文件**: `src/schema/package-schema.ts`
- 删除 `aiSettings?: AISettings` 及其 import
- 新增 `AIEnhancementMeta { enabled, provider?, model?, usages? }`
- `AIContextPackage` 改为 `aiEnhancement?: AIEnhancementMeta`
- 新增 `PageAssets { dsl?, html?, screenshotBase64?, screenshotMime?, dslSource? }`
- 新增 `PackageAssets { pages: Record<string, PageAssets> }`
- `AIContextPackage` 新增 `assets?: PackageAssets`
- 扩展 `ExportMode` 为 6 值(selected_nodes/selected_frames/current_page_top_frames/container_children/manual_selected_pages/flow_group)
- 验收: tsc 通过,无 aiSettings 字段残留

### Step 2 — 安全模块 [P0] ⬜
**新增**: `src/modules/security/redact.ts` → `redactSensitive(value)`
- 过滤: apiKey/apikey/Authorization/Bearer/token/secret/password/rawPRD → [REDACTED]
**新增**: `src/modules/export/sanitize.ts` → `sanitizePackageForExport(pkg)`
- 深拷贝后剥离敏感字段,缺失则 [REDACTED]
**改**: `lib/main.ts` console 转发前调 redactSensitive
- 验收: redact 单测心智(空/嵌套/数组),tsc 通过

### Step 3 — assets 注入 + 导出可用 [P0] ⬜
**改**: `src/modules/orchestrator.ts`
- 构建 pkg 时写入 `assets.pages[pageId] = { dsl, html, screenshotBase64, screenshotMime:'image/png', dslSource }`
- 移除 pkg 里残留的 aiSettings 赋值,改为 aiEnhancement(从入参 settings 提取非敏感元信息)
**改**: `src/modules/exporter.ts`
- exportJSON/exportMarkdown/generatePrompt **入口统一先调 sanitizePackageForExport**
- Prompt 不内嵌 base64,加"资产说明"指向 assets.pages
- Prompt 读 aiSettings 处改为 aiEnhancement
- 验收: 导出 JSON 含真实 dsl/html/screenshotBase64;Prompt 无 base64;无 apiKey

### Step 4 — PRD 链路 [P0] ⬜
**新增**: `ui/components/PRDPanel.tsx`(summary/businessRules/userStories/acceptanceCriteria/specialRules/rawPRD + 粘贴/清空/保存草稿/折叠/是否导出rawPRD)
**改**: `ui/App.tsx` 加 `prdContext` state,生成包时传入(不再 null)
**存储**: clientStorage `context-forge:prd-draft:{documentId}`,**草稿排除 rawPRD**(B4)
- 验收: 可填 PRD,进入 pkg.prdContext,质量报告不再误报 PRD 缺失

### Step 5 — AI 设置页闭环 [P0] ⬜
**改/用**: `ui/components/AISettingsPanel.tsx`(已存在,需对齐)
- 字段: enabled/provider/baseUrl/apiKey/model/temperature/maxTokens/timeout/5个usages
- 测试连接(UI iframe fetch /models 或 /chat/completions)+ 6 类失败原因
- 保存(clientStorage)/清除Key/CORS提示
**改**: `messages/sender.ts` 加 TEST_AI_CONNECTION / AI_CONNECTION_TESTED
**安全**: Key 只进 clientStorage,绝不进包/console/debug(B3)
- 验收: 配置/保存/清除/测试连接 全可用;清除后 clientStorage 无残留

### Step 6 — FlowConfirm 完整化 [P0] ⬜
**新增**: `RelationCard.tsx` / `RelationEditor.tsx` / `UnresolvedQuestionResolver.tsx` / `AddRelationDialog.tsx`
**重构**: `FlowConfirm.tsx`
- RelationEditor 编辑: fromPage/triggerElement/triggerElementType/interactionType/actionType/target/targetType/condition/expectedState/failureState/confidence/confirmedByUser/naturalLanguage
- UnresolvedQuestionResolver: 选 option/动作/目标/标记不需要/转备注 → 更新 interaction + confirmedByUser/userModified + 移出队列
- AddRelationDialog: 手动新增关系
- **0 关系空状态**: 显示原因 + [添加主流程][添加跳转][添加弹窗][添加状态][重新识别]
- 验收: 可编辑/新增/删除/处理问题;0 关系有解释和补救入口

### Step 7 — 编辑后重算 [P0] ⬜
**新增**: `src/modules/package/recalculate.ts` → `recalculatePackageAfterUserEdit(pkg, updatedInteractions)`
- 重算: interactions/total/high/medium/low/userConfirmed count、unresolvedQuestions、pageGraph.pageGroups、qualityReport、collectionStats.interactionsConfirmed
**改**: UI 每次 确认/删除/修改/新增关系/处理问题/改页面类型/排除页面/改入口页 → 调 recalculate
- 验收: 用户改动后评分实时正确

### Step 8 — 页面识别结果页 [P1] ⬜
**新增**: `ui/components/PageReviewPanel.tsx`
- 分组: 主页面/弹窗抽屉/状态页/组件素材/未知未归属
- 每项: 名称/类型/置信度/数据状态/是否确认/是否入口页
- 操作: 改类型/重命名/排除/设入口页/设弹窗/设状态/恢复自动
- 改后重算 pageList/pageGraph/interactionGraph/qualityReport
- 验收: 能看到具体页面而非数量;可改类型/入口页/排除

### Step 9 — 类型优先级 + 深层扫描 [P1] ⬜
**改**: `src/modules/page-identifier.ts` classifyPageType
- 优先级: state_* > modal/drawer > entry/home/list/detail/form > component > unknown
- 弹窗/modal/dialog/popup→modal;抽屉/drawer→drawer;空/错误/成功/loading→state
**新增**: `src/modules/identify/deep-summary.ts`(maxDepth6/maxNodes1000,提取 button/input/search/filter/tab/table/list/card/modal/drawer/form/pagination/toast/empty/error/loading/link/menu/dropdown/checkbox/radio/switch)→ componentStats/keyElements/mainRegions
- 验收: 新增任务弹窗→modal;编辑抽屉→drawer;空状态→state_empty;摘要含深层元素

### Step 10 — 稳定 ID + source 数组 [P1] ⬜
**新增**: `src/modules/utils/stable-id.ts` → `createStableInteractionId(fromPageId+triggerNodeId+actionType+targetId)` hash
**改**: `src/schema/interaction.ts` source 改 `Array<'rule'|'ai'|'prototype'|'prd'|'user'|'naming'|'layout'>`
**改**: relation-inference.ts(id+source)、exporter.ts、FlowConfirm.tsx、quality-checker.ts 所有 source 引用 → `source.join(' + ')`
- 同时按审计 7.3: closeModal/goBack 加 returnToPageId/overlayOwnerPageId(进待确认问题)
- 验收: 同设计稿多次导出 id 稳定;source 多源展示

### Step 11 — Prompt 增强 [P1] ⬜
**改**: `src/modules/exporter.ts` generatePrompt
- 开头加"# 重要边界"(ContextForge 只提供上下文,不生成 HTML)
- 加"# 待确认问题/不确定关系"(question/relatedPage/relatedElement/suggestedOptions)
- 加"# 资产说明"(JSON 模式资产在 assets.pages)
- 验收: Prompt 含三新章节

### Step 12 — 质量规则调整 [P1] ⬜
**改**: `src/modules/quality-checker.ts`
- 截图缺失: DSL或HTML存在→warning;三者全缺→blocking
- HTML缺失: DSL+screenshot在→info;screenshot也缺→warning
**改**: `src/schema/quality-report.ts` calculateQualityScore
- **页面>1 且交互=0 → 交互完整度大幅扣分,不可高分,生成 unresolvedQuestion**
- 评分拆维度: 数据完整度/页面确认度/交互完整度/PRD完整度/导出可用性
- 验收: 0 交互不再 95 分;评分可分项解释

### Step 13 — UX 流程化重构 [P0] ⬜
**新增组件**: AppHeader / StepIndicator / ScopePanel / ReadinessSummary / QualityPanel / ExportPanel / JsonPreviewPanel / EmptyState / StatusBadge / ActionBar
**重构**: `ui/App.tsx` 为 7-Step 流程(选择范围/读取结果/页面确认/流程确认/PRD补充/质量检查/导出)
- StepIndicator 状态: pending/active/done/warning/blocked
- 顶部文案: "当前环境:设计模式 Canvas / Codegen:不可用,已降级" (去掉 canvas?/build-probe)
- ReadinessSummary 替代绿色大框;0 交互不显示高分+给解释
- JsonPreviewPanel: 默认折叠+摘要+一键复制+Toast(去掉 Cmd+A 提示)
- ExportPanel: 放最后;warning→谨慎导出;blocking→禁用+查看问题
- 完成后下一步建议 + 面向工具的复制按钮
- debug 面板 DEV 开关默认隐藏(B5)
- 验收: 15 项 UX 验收逐条过

### Step 14 — DevMode codegen Probe [P1] ⬜
**改**: debug 面板加"运行 DevMode Codegen Probe"入口(开发态可见)
- 测 mg.codegen/getDSL/getCode/framework/返回结构/错误场景 → 生成可复制 Markdown
**改**: `capability-report.md` 留实测回填位
- 验收: 有入口,产出报告(实测需用户在 DevMode 跑)

### Step 15 — 构建 + 文档 + 总结 [P0] ⬜
- typecheck + build:npm 通过
- 更新 EXECUTION-SUMMARY / PRD-TRACEABILITY / quality-metrics / capability-report / USER-GUIDE
- 输出 10 项交付物(变更摘要/修复清单/新增文件/修改文件/安全自检/导出样例/UX说明/typecheck/build/后续建议)
- commit + push

---

## 3. 目录结构调整(审计 P1-03,随 Step 落地)

```
src/modules/
  collect/    (collector.ts 迁入,Step 3/9 时)
  identify/   (page-identifier.ts + deep-summary.ts)
  relations/  (relation-inference.ts)
  quality/    (quality-checker.ts)
  export/     (exporter.ts + sanitize.ts)
  package/    (recalculate.ts)
  security/   (redact.ts)
  utils/      (stable-id.ts)
```
注:为降低风险,**先在原位完成功能修复,目录迁移作为 Step 内附带操作,不单独制造大移动**(避免 import 雪崩)。orchestrator 拆分(P1-02)本轮**不做**(非 MVP 阻断项,记入后续)。

---

## 4. 19 项验收清单(Step 15 逐条自检)

**安全(7)**: apiKey 不在 task.json/prompt.md/context.md/quality-report/console/debug;清除后 clientStorage 无残留
**导出(6)**: JSON 含真实 DSL/HTML/screenshotBase64;Prompt 说明 assets 位置;MD 不嵌 base64;导出前 sanitize
**PRD(5)**: 可填摘要/业务规则/验收标准;进 pkg.prdContext;不再误报 PRD 缺失
**流程(6)**: 可确认/删除/改目标/改动作/处理问题;改后重算质量
**识别(5)**: 弹窗→modal;抽屉→drawer;空→state_empty;错误→state_error;可手动改类型;可设入口页/排除
**UX(15)**: 见体验报告 §5 全 15 条
**构建(6)**: typecheck/build 通过;dist 产物;无 TS error;无 Key 泄漏

---

## 5. 本轮明确不做(记入后续,不擅自做)

- ZIP 导出(P2)
- 历史记录(P2)
- 分包导出(P2)
- AI 增强实际调用(仅做设置闭环)
- orchestrator 大拆分 / lib 大拆分(非阻断)
- 复杂拖拽流程图
- 生产级 D2C

---

## 6. 执行承诺

1. 严格按 Step 1→15 顺序,不跳步
2. 每步 typecheck,不积累错误
3. 不擅自加功能,不擅自降要求
4. 边界 B1-B7 全程不破
5. 自己 commit+push(钥匙串已配),网络不通则本地提交并告知
6. 全部完成后输出交付总结,中途不打断用户
