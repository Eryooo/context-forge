# ContextForge — MasterGo / Figma AI 上下文数据包生成器

**ContextForge** 是一个插件工具,从 MasterGo / Figma 设计稿中提取完整上下文(页面结构 + 交互关系 + 业务规则 + 质量报告),生成标准化数据包,供外部 AI 工具(Claude/GPT/Cursor 等)生成可交互 HTML Demo 或 React/Vue 代码。

---

## 核心特性

### 1. 多维度页面识别(14 种类型)
- **主页面**: entry / home / list / detail / form
- **弹窗 / 抽屉**: modal / drawer
- **状态页**: state_empty / state_loading / state_error / state_success
- **组件素材**: component / unknown

### 2. 3 种交互关系推断
- **命名规则**:识别"新增/编辑/查看/返回/提交"等关键词
- **原型连线**:利用 MasterGo reactions(原型跳转连线)
- **布局位置**:根据父子关系推断状态页归属

### 3. 完整数据包(JSON / Prompt / Markdown)
- **页面清单**:DSL + HTML + 截图 base64
- **交互关系**:fromPage → targetPage,置信度分级(高/中/低)
- **主流程 + 挂载关系**:自动识别入口页和主流程
- **质量报告**:18 种检查项,自动评分(0–100)
- **PRD 上下文**:业务规则 / 用户故事 / 验收标准
- **AI 增强元信息**:provider / model / usages

### 4. 7-Step 流程化 UX
1. **配置项目**:项目名/范围(选中 Frame / 当前页 / 容器内)
2. **识别中...**:自动识别页面类型 + 推断交互关系
3. **页面确认**:改类型 / 重命名 / 排除,实时重算
4. **流程确认**:确认 / 修改 / 删除关系,补充主流程
5. **PRD 补充**(可选):业务规则 / 用户故事 / 原始 PRD(默认不进历史)
6. **AI 设置**(可选):OpenAI-compatible API,测试连接(6 类失败原因)
7. **质量预览**:阻断性问题 / 警告 / 建议
8. **导出**:JSON / Prompt / Markdown

### 5. 质量保障
- **18 种检查项**:页面>1 且交互=0 → blocking(-50 分),入口页缺失 → blocking,截图/DSL/HTML 分级(blocking/warning/info)
- **用户编辑后重算**:改页面类型/关系后,自动重算 counts/unresolvedQuestions/pageGroups/qualityReport
- **安全脱敏**:导出前强制 sanitize,console 转发前 redact,API Key 不进数据包/历史/快照

---

## 安装与使用

### 1. 克隆仓库
```bash
git clone https://github.com/Eryooo/context-forge.git
cd "context-forge/MasterGo AI Context "
npm install
```

### 2. 构建插件
```bash
npm run build
```

构建产物在 `dist/` 目录。

### 3. 在 MasterGo / Figma 中安装
- **MasterGo**:插件管理 → 从本地导入 → 选择 `dist/manifest.json`
- **Figma**:Plugins → Development → New Plugin → 选择 `dist/manifest.json`(需改 manifest 适配 Figma API)

### 4. 使用
1. 在设计稿中选中要导出的 Frame(或切换到"当前页面"模式)
2. 运行插件,填写项目名/描述
3. 按 7-Step 流程操作:页面确认 → 流程确认 → PRD 补充 → AI 设置 → 质量预览 → 导出
4. 复制导出的 JSON / Prompt,交给 Claude / GPT / Cursor 等 AI 工具生成代码

---

## 架构

```
MasterGo AI Context /
├── src/
│   ├── schema/           # 数据包 Schema(TypeScript 类型定义)
│   │   ├── package-schema.ts      # AIContextPackage 根类型
│   │   ├── page-graph.ts          # PageNode / PageGraph
│   │   ├── interaction.ts         # Interaction / InteractionGraph
│   │   ├── quality-report.ts      # QualityReport / QualityIssue
│   │   └── ai-settings.ts         # AISettings(API Key 仅本地)
│   ├── modules/          # 核心业务逻辑
│   │   ├── collector.ts           # 数据采集(DSL/HTML/截图/reactions)
│   │   ├── page-identifier.ts     # 页面类型识别(命名规则+尺寸特征)
│   │   ├── relation-inference.ts  # 交互关系推断(命名+原型连线)
│   │   ├── quality-checker.ts     # 质量检查(18 种检查项)
│   │   ├── orchestrator.ts        # 主流程编排(串联所有模块)
│   │   ├── exporter.ts            # 导出(Prompt/JSON/Markdown)
│   │   ├── security/              # 安全模块
│   │   │   └── redact.ts          # redactSensitive(脱敏 apiKey/rawPRD)
│   │   ├── export/                # 导出子模块
│   │   │   └── sanitize.ts        # sanitizePackageForExport(双保险)
│   │   ├── utils/                 # 工具函数
│   │   │   └── stable-id.ts       # 哈希生成稳定 ID(替代 Date.now+Math.random)
│   │   ├── package/               # 数据包操作
│   │   │   └── recalculate.ts     # 用户编辑后重算
│   │   └── identify/              # 识别子模块
│   │       └── deep-summary.ts    # 深层扫描(maxDepth6/maxNodes1000)
│   └── lib/
│       └── main.ts       # 插件主线程入口(MasterGo API 调用)
├── ui/                   # 前端 UI(React + Vite)
│   ├── App.tsx           # 7-Step 流程主界面
│   ├── components/
│   │   ├── FlowConfirm.tsx        # 页面流程确认页
│   │   ├── PRDPanel.tsx           # PRD 补充面板
│   │   ├── AISettingsPanel.tsx    # AI 设置面板
│   │   └── PageReviewPanel.tsx    # 页面识别结果确认页
│   ├── ai/
│   │   └── ai-client.ts           # OpenAI-compatible API 调用(UI iframe 侧)
│   └── diag.ts           # 诊断快照(调试用)
├── messages/             # 主线程 ↔ UI 通信协议
│   └── sender.ts
├── dist/                 # 构建产物
│   ├── main.js           # 主线程 bundle
│   ├── index.html        # UI iframe
│   └── manifest.json     # 插件清单
├── ITERATION-PLAN-R2.md  # 迭代 R2 计划(15 步改造)
└── README.md
```

---

## 数据包 Schema

导出的 JSON 数据包结构:

```json
{
  "packageMeta": {
    "schemaVersion": "1.0.0",
    "exportTool": "ContextForge",
    "exportMode": "selected_frames",
    "exportedAt": 1703001234567,
    "aiEnhanced": false,
    "buildId": "mvp-r2"
  },
  "project": {
    "name": "任务管理系统 MVP",
    "description": "...",
    "documentId": 123456
  },
  "pageList": {
    "pages": [
      {
        "pageId": "page_abc123",
        "pageName": "任务列表页",
        "pageType": "list",
        "typeConfidence": 0.85,
        "nodeId": "abc123",
        "summary": { "layout": "vertical", "mainRegions": [...], ... },
        "dslStatus": "success",
        "htmlStatus": "unavailable",
        "screenshotStatus": "success"
      }
    ]
  },
  "pageGraph": {
    "mainFlow": ["page_entry", "page_home", "page_list", "page_detail"],
    "entryPage": "page_entry",
    "pageGroups": [...]
  },
  "interactionGraph": {
    "interactions": [
      {
        "id": "int_3a4b7c21",
        "interactionType": "overlay",
        "fromPage": "page_list",
        "triggerElement": "新增按钮",
        "actionType": "openModal",
        "targetType": "overlay",
        "targetOverlayId": "page_modal_add",
        "confidence": 0.9,
        "source": ["prototype", "naming"],
        "confirmedByUser": false,
        "naturalLanguage": "..."
      }
    ],
    "unresolvedQuestions": [...],
    "totalInteractions": 15,
    "highConfidenceCount": 10,
    "userConfirmedCount": 0
  },
  "prdContext": {
    "summary": "用户可查看任务列表、新增任务、进入详情。",
    "businessRules": [...],
    "userStories": [...],
    "acceptanceCriteria": [...],
    "specialRules": [...]
  },
  "assets": {
    "pages": {
      "page_abc123": {
        "dsl": { ... },
        "html": "...",
        "screenshotBase64": "data:image/png;base64,...",
        "screenshotMime": "image/png",
        "dslSource": "codegen"
      }
    }
  },
  "qualityReport": {
    "score": 75,
    "checks": { ... },
    "blockingIssues": [...],
    "warnings": [...],
    "unresolvedQuestions": [...]
  },
  "aiEnhancement": {
    "enabled": false,
    "provider": "openai-compatible",
    "model": "gpt-4",
    "usages": { ... }
  },
  "collectionStats": { ... },
  "aiExecutionInstruction": { ... }
}
```

---

## 安全保障

### 1. API Key 不进数据包
- `aiSettings.apiKey` **从不**进入数据包(`AIContextPackage.aiEnhancement` 仅含 provider/model/usages)
- 仅保存到 `clientStorage`(本地持久化),不经主线程转发

### 2. 导出前双保险脱敏
- `sanitizePackageForExport`:深拷贝 + `redactSensitive`(剥离 apiKey/authorization/bearer/token/secret/rawPRD 等)
- `applyRawPRDPolicy`:用户未勾选 `includeRawPRD` 时,强制删除 `prdContext.rawPRD`

### 3. console 转发前脱敏
- 主线程 console.log/warn/error 转发到 UI iframe 前,调 `redactArgs`(redactSensitive 批量处理)
- 防止 apiKey/rawPRD 泄漏到调试快照

### 4. PRD 草稿不含 rawPRD
- `SAVE_PRD_DRAFT` 主线程侧二次剥离 `rawPRD`(UI 已剥离,主线程再兜底)
- rawPRD 默认不进历史记录(审计 B4)

---

## 迭代记录

### R2(2025-01):安全 + 质量 + 流程化(15 步改造)
完整改造清单见 [ITERATION-PLAN-R2.md](./ITERATION-PLAN-R2.md)。核心改动:
- **P0 安全审计**:删 `aiSettings` 字段,改为 `aiEnhancement`,assets 内联真实数据,导出前强制 sanitize
- **P0(UX) 质量规则**:页面>1 且交互=0 不可高分(blocking -50),截图/HTML 分级
- **7-Step 流程化 UX**:配置→识别→页面确认→流程确认→PRD→AI设置→质量预览→导出
- **稳定 ID + source 数组 + target 细分**:hash 生成稳定 ID,source 改数组,target 拆为 targetPageId/targetOverlayId/targetStateId/returnToPageId
- **类型优先级修复**:state_* > modal/drawer > entry/home/list/detail/form > component > unknown
- **Prompt 增强**:边界声明 / 待确认问题详情 / 资产说明 3 章节
- **DevMode probe**:测试 mg.codegen.getDSL/getCode 可用性
- **深层扫描模块**:maxDepth6 / maxNodes1000 递归扫描关键元素

### R1(2024-12):MVP 基础功能
- 页面类型识别(14 种)
- 交互关系推断(命名规则+原型连线)
- DSL/HTML/截图采集(三层降级)
- 质量检查(18 种检查项)
- 导出 JSON/Prompt/Markdown

---

## 审计清单

完整审计清单及修复状态见项目根目录 **AUDIT-16Q-CHECKLIST.md**(16 问审计,每问覆盖 1–5 个代码位置)。

**核心审计项(全部修复)**:
- ✅ **A01**:API Key 泄漏风险(删 aiSettings,改 aiEnhancement,双保险脱敏)
- ✅ **A04/A05**:assets 内联(真实 DSL/HTML/screenshot base64)
- ✅ **A12**:0 关系不可高分(blocking -50,生成 unresolvedQuestion)
- ✅ **A15**:0 关系空状态(原因+补救入口)
- ✅ **B4**:rawPRD 默认不进历史(草稿排除+导出开关)

---

## 常见问题

### 1. 为什么截图 / DSL / HTML 缺失?
- **截图缺失**:节点过大(>10000px)或导出失败 → 重新选中较小范围
- **DSL 缺失**:MasterGo codegen API 不可用 → 在 DevMode 下重新导出,或接受降级(用 node tree 摘要)
- **HTML 缺失**:非 DevMode 环境 → 如需 HTML,在 DevMode 下重新导出

### 2. 为什么质量评分低?
- 页面>1 但交互=0 → blocking -50 分,建议:① 添加原型连线(reactions);② 规范按钮命名("新增/编辑/查看");③ 手动补充主流程
- 截图/DSL 全缺 → blocking -20 分,建议重新导出
- 入口页缺失 → blocking -30 分,建议手动设为入口页

### 3. 为什么页面类型识别错误?
- **类型优先级**:modal/drawer > form,如"新增任务弹窗"被识别为 modal(正确),而非 form
- 在"页面确认"步骤手动改类型,改后自动重算

### 4. 如何补充主流程?
- 在"流程确认"步骤,点"手动新增关系"按钮,选择 fromPage → actionType → targetPage
- 或在 MasterGo 中添加原型连线(reactions),重新生成数据包

### 5. 如何使用 AI 增强?
- 在"AI 设置"步骤,填写 OpenAI-compatible API(baseUrl + apiKey + model)
- 点"测试连接"(6 类失败原因:① Key 错 ② URL 错 ③ CORS ④ 网络 ⑤ 跨域 ⑥ 未知)
- 勾选增强用途(页面语义/关系推断/PRD 摘要/Prompt 压缩/质量校验)
- **注意**:OpenAI 官方端点通常拒绝浏览器跨域,需使用支持 CORS 的兼容代理/企业网关,或改用"导出后交外部 AI"模式

---

## 技术栈

- **插件框架**:MasterGo Plugin API
- **前端**:React + Vite + TypeScript
- **构建**:esbuild(main) + Vite(UI)
- **数据采集**:MasterGo codegen API(DSL) + exportAsync(截图) + reactions(原型连线)
- **AI 增强**(可选):OpenAI-compatible chat completion API

---

## 开发与调试

### 1. 开发模式
```bash
npm run dev:ui    # UI 热更新(localhost:3000)
npm run dev:main  # 主线程 watch 模式
```

### 2. 类型检查
```bash
npm run typecheck
```

### 3. 调试
- 在插件 UI 右下角点"诊断"按钮,查看主线程日志 / 环境信息 / probe 结果
- 导出诊断快照(JSON),可离线分析

---

## License

MIT

---

## 贡献

欢迎提 Issue / PR。审计清单和迭代计划在项目根目录,修复请对应审计项编号。

---

**ContextForge — 让设计稿成为 AI 可理解的上下文数据包。**
