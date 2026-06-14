# MasterGo 插件 API 能力探测报告 (Capability Report)

> **项目**:ContextForge
> **阶段**:Step 1 — API 能力探测 Spike
> **日期**:2026-06-09
> **结论可信度分级**:
> - 🟢 **已验证(静态)**:基于官方 `@mastergo/plugin-typings@2.2.0` 类型定义 + 官方文档,API 在类型层面确实存在,签名明确。
> - 🟡 **需实跑确认**:类型存在但运行时行为/取值/权限未知,**必须由 probe 插件在 MasterGo 客户端实跑确认**。
> - 🔴 **存疑/未知**:typings 中无定义,仅靠文档或推断,风险高。

---

## 0. 重要前提与方法说明(诚实标注)

**本报告当前为"静态推断版 + 实跑模板"。** 原因:Claude Code 运行在 CLI 环境,**无法进入 MasterGo 插件沙盒执行 `mg` API**。因此:

1. 所有 🟢 结论来自对官方类型定义 `dist/index.d.ts`(1338 行,已完整核对)和 developers.mastergo.com 文档的交叉验证 —— 可信,但不等于运行时实测。
2. 所有 🟡 / 🔴 结论,**已写成一个可运行的探测插件(probe)**,需要你在 MasterGo 客户端加载实跑,把结果(UI 上"复制结果 Markdown")回贴,我据此把本报告升级为"实测确认版"。

**探测插件位置**:工程根目录,已构建出 `dist/main.js` + `dist/index.html`,可直接在 MasterGo「开发插件」中加载。

**关键事实更正**(文档 vs 实际):
- 开发手册 PDF 里的 manifest 示例字段 `api` / `editorType` / `permissions` **不是官方模板真实字段**。官方 React 模板真实 manifest 为:
  ```json
  { "name","id"(number),"main":"dist/main.js","ui":"dist/index.html",
    "editor_type":["canvas","devMode"], "capabilities":["inspect"] }
  ```
- 选区路径是 `mg.document.currentPage.selection`(不是 `mg.selection`)。
- 节点可见性属性是 `isVisible`(不是手册伪代码里的 `visible`)。
- 官方模板 `tsconfig` 误设 `skipLibCheck:false`,导致 typings 自带的 `console` 重复声明报错;已修正为 `true`(与手册 4.2 推荐一致)。

---

## 1. 八项探测结论总览

| # | 能力 | 静态结论 | API 依据 | 待实跑确认点 |
|---|------|---------|---------|------------|
| 1 | 读取当前选区 | 🟢 可直接实现 | `mg.document.currentPage.selection: ReadonlyArray<SceneNode>` | 仅需确认空选区表现 |
| 2 | 遍历节点树 | 🟢 可直接实现 | `ChildrenMixin.children / findAll / findAllWithCriteria` | 大画布性能上限 |
| 3 | 读名称/类型/尺寸/样式/文本 | 🟢 可直接实现 | `BaseNodeMixin / LayoutMixin / GeometryMixin / TextNode` | `cornerRadius` 等可能返回 `mixed` symbol |
| 4 | 导出截图 (PNG) | 🟢 可直接实现 | `ExportMixin.exportAsync(): Promise<Uint8Array\|string>` | 大图字节量 / base64 传输体积 |
| 5 | DSL / codegen / HTML / D2C | 🟡 **需降级设计** | 官方文档 `mg.codegen.getDSL/getCode`(**typings 无此类型**) | **仅 DevMode 可用;framework 取值未知;能否取 HTML 未知** |
| 6 | clientStorage | 🟢 可直接实现 | `clientStorage.get/set/delete/keysAsync` | 存储容量上限 |
| 7 | 主线程 ↔ UI 通信 | 🟡 **需实跑确认** | `mg.showUI / mg.ui.postMessage / onmessage` | **UI→主线程消息是否被 `pluginMessage` 包裹** |
| 8 | fetch 外部 API | 🔴 **需实跑确认** | typings 无 `fetch` 全局声明 | **主线程 / UI iframe 是否允许外网,是否需域名白名单** |

---

## 2. 可直接实现的能力(🟢)

这些能力 API 明确、签名清晰,可作为 MVP 采集层的可靠基础。

### 2.1 选区读取(探测项 1)
- **接口**:`mg.document.currentPage.selection`。
- **可得字段**:每个 `SceneNode` 的 `id / name / type / isVisible / width / height / x / y`。
- **用途**:MVP「一键读取选区」「读取当前画布顶层 Frame」直接基于此。
- **降级**:空选区时回退到遍历 `currentPage` 顶层 children 作为候选页面。

### 2.2 节点树遍历(探测项 2)
- **接口**:`node.children`(递归)、`node.findAll(cb)`、`node.findAllWithCriteria({types:[...]})`。
- **能力**:可按类型批量筛选(如一次性取出所有 `FRAME` / `TEXT` / `INSTANCE`),非常适合页面候选识别与候选交互识别。
- **必须做**:受控递归(深度上限、每层数量上限),手册建议 `maxDepth:10 / maxChildrenPerNode:200 / maxNodesPerPage:3000`。probe 中已用 6/50 做安全探测。

### 2.3 节点属性读取(探测项 3)
- **基础**:`id / name / type / width / height / x / y / bound / absoluteBoundingBox`。
- **样式**:`fills / strokes / strokeWeight / opacity / effects`;AutoLayout 的 `flexMode / itemSpacing / paddingTop…`;圆角 `cornerRadius`(⚠️ 混合圆角时返回 `PluginAPI['mixed']` symbol,序列化需处理)。
- **文本**:`TextNode.characters`(正文)、`fontName / textStyles / textAlignHorizontal`。
- **组件**:`InstanceNode.mainComponent / componentProperties / variantProperties` —— 对组件识别非常有价值。

### 2.4 截图导出(探测项 4)
- **接口**:`node.exportAsync({ format:'PNG', constraint:{type:'SCALE',value:1} })` → `Promise<Uint8Array>`。
- **支持格式**:PNG / JPG / WEBP / SVG / PDF。
- **传输**:Uint8Array 需转 base64 经 postMessage 传给 UI 预览/打包;手册要求「Markdown 只放截图路径,不内嵌 base64」,ZIP 内才放图。
- **性能**:截图可能较大,需限制数量与缩放比。

### 2.5 clientStorage(探测项 6)
- **接口**:`getAsync / setAsync / deleteAsync / keysAsync`,可存对象/数组/Uint8Array。
- **特性**:**按用户本地存储,不跨用户,清缓存会丢失**。
- **用途**:AI 设置、API Key、页面/关系确认结果、历史记录(限 20 条)。
- **安全**:API Key 仅存此处,提供一键清除;大数据包不长期存此处。

---

## 3. 需要降级的能力(🟡)

### 3.1 DSL / codegen / HTML / D2C(探测项 5)—— 最大不确定项
**现状**:
- `mg.codegen` **在 typings 2.2.0 中完全没有类型定义**,仅官方独立文档页描述,方法为 `getDSL(layerId, framework)` / `getCode(...)` / `getCodeByDSL(...)`,均 `Promise`、可能返回 `null`。
- 官方明确:**codegen 仅在研发模式(DevMode)可用**。设计模式(canvas)下 `mg.codegen` 很可能 `undefined`。
- `framework` 参数(`MGDSL.Framework`)的**具体取值未知**,probe 尝试了 `html/react/vue/css`。
- HTML / D2C 是否能稳定取到,**官方无明确保证**。

**必须的三层降级链路(手册 1.3 / 7.5)**:
1. **优先级 1**:`mg.codegen.getDSL` 获取官方 DSL(仅 DevMode)。
2. **优先级 2**:`mg.codegen` 不可用 → 自研节点树序列化为 **DSL-like JSON**(基于 §2.2 + §2.3,完全可行)。
3. **优先级 3**:仅页面摘要 + 截图 + PRD。

**对实现的影响**:DSL 采集**不能作为硬依赖**。HTML 失败标记 `htmlStatus:'unavailable'`,在 Prompt 中明确告知外部 AI「该页面无 HTML 参考,请用 DSL/截图/摘要生成」。**主流程绝不能因 DSL/HTML 失败而中断**(对应 MVP 优先级 #4)。

### 3.2 主线程 ↔ UI 通信(探测项 7)
- **接口确定**:`mg.showUI(__html__, {width,height})`、`mg.ui.postMessage(msg)`、`mg.ui.onmessage`、UI 侧 `parent.postMessage(msg,'*')`。
- **不确定点**:UI→主线程的消息**是否被包一层 `{pluginMessage}`**(Figma 风格)还是裸对象(官方模板 `sender.ts` 是裸对象)。probe UI 侧已用 `event.data?.pluginMessage ?? event.data` 双兼容,并加了 **1.5s 通信看门狗**,若主线程没回 PONG 会自证为 error。
- **降级**:确认包裹形式后,统一消息封装即可,无功能风险。

---

## 4. 暂时无法确认 / 高风险的能力(🔴)

### 4.1 fetch 外部 API(探测项 8)—— AI 增强的关键前提
**现状**:
- typings **没有 `fetch` 全局声明**。手册 1.1 明确「不要默认可以访问完整浏览器 API」,1.10.4 又给了用 `fetch` 调 OpenAI 的示例 —— **文档自相矛盾,必须实跑**。
- probe 分两路测:**8a 主线程 fetch**、**8b UI iframe fetch**,各自真实请求 `api.github.com` 验证是否被 CSP/网络策略拦截。

**三种可能结果与对策**:
| 实跑结果 | AI 增强可行路径 |
|---------|---------------|
| 主线程 fetch 通 | 可在主线程发起(但仍建议 UI 侧管 Key) |
| 仅 UI iframe fetch 通 | **AI 请求放 UI iframe**(手册推荐降级) |
| 两者都被拦 | AI 增强只能走「导出数据包→交外部 AI 工具」离线模式 |

**对 MVP 影响**:无论哪种结果,**MVP 不依赖 AI**(规则识别优先,AI 后置 —— MVP 优先级 #1),所以 fetch 即使完全不可用,也不阻断 MVP。AI 增强属 V0.2 范围。

---

## 5. 对 MVP 范围的影响(结论)

| MVP 能力 | 受影响程度 | 说明 |
|---------|-----------|------|
| 一键读取选区 | ✅ 无影响 | 🟢 直接实现 |
| 节点树序列化 | ✅ 无影响 | 🟢 直接实现 |
| 页面识别 / 类型识别 | ✅ 无影响 | 基于节点属性 + 命名规则 |
| 候选交互识别 | ✅ 利好 | `ReactionMixin.reactions`(原型连线)是高价值信号,可直接读 |
| DSL 采集 | ⚠️ 需降级 | DevMode 才有 codegen;否则用 DSL-like JSON 兜底 |
| HTML / D2C 采集 | ⚠️ 需降级 | 不可作硬依赖,失败标 unavailable |
| 截图采集 | ✅ 无影响 | 🟢 直接实现 |
| Prompt / JSON 导出 | ✅ 无影响 | 纯前端字符串拼装 |
| ZIP 导出 | ✅ 无影响(后置) | 需引入 zip 库;MVP 优先级 #2 已后置 |
| clientStorage(设置/历史) | ✅ 无影响 | 🟢 直接实现 |
| AI 增强 | 🔴 取决于 fetch | 不阻断 MVP;AI 为 V0.2 可选增强 |
| 质量报告 | ✅ 无影响 | 纯逻辑计算 |

**总体结论**:
- **MVP 核心闭环(选区→采集→识别→关系草案→确认→导出 Prompt/JSON)在 API 层面完全可行**,不存在阻断性缺口。
- 唯二需要工程化降级的是 **DSL/HTML 采集(项 5)** 和 **AI 增强的 fetch(项 8)**,二者都已有明确降级路径,且都**不阻断主流程**,与你设定的 MVP 优先级 #4、#1 完全吻合。
- **建议**:Step 2 冻结 Schema 时,`dataStatus` 字段(`dsl/html/screenshot: success|fallback|unavailable|failed`)必须作为一等公民,让降级状态贯穿整个数据包。

---

## 6. 待你回填的实跑结果(占位)

> 在 MasterGo 中加载 probe 插件 → 选中一个含文本的 FRAME → 点「运行全部探测」→ 用 DevMode 再跑一次(测 codegen)→ 点「复制结果 Markdown」回贴。我会据此把本节及上方 🟡🔴 结论升级为实测确认版。

### 6.1 设计模式(canvas)实跑结果 — ✅ 已完成(build=probe-3, 客户端 master-pri-desktop/1.10.6)

| # | 能力 | 实测状态 | 关键证据 |
|---|------|---------|---------|
| 1 | 读取当前选区 | ✅ 可用 | 读到 2 个 FRAME(id/name/type/isVisible/width/height 齐全) |
| 2 | 遍历节点树 | ✅ 可用 | 受控遍历 259 节点;`findAll()` 可用,全量 271;深度 6;27ms |
| 3 | 名称/类型/尺寸/样式/文本 | ✅ 可用 | base + style(fills/cornerRadius/opacity/flexMode/itemSpacing) + 文本(后代 TEXT "搜索 ctrl+k") |
| 4 | 导出截图 PNG | ✅ 可用 | `exportAsync` 返回 Uint8Array,153041 字节,143ms |
| 5 | DSL/codegen/HTML/D2C | ⛔ canvas 不可用 | `mg.codegen` 不存在(预期,仅 DevMode);**待 §6.2 验证** |
| 6 | clientStorage | ✅ 可用 | 写/读/列/删 全过,删除后不残留 |
| 7 | 主线程↔UI 通信 | ✅ 可用 | 往返 194ms;**消息为裸对象 `{type,data}`,不包 pluginMessage**(已定论) |
| 8a | 主线程 fetch | ⛔ 不可用 | 主线程沙盒未暴露 fetch(预期) |
| 8b | UI iframe fetch | ✅ 可用 | 真实请求 HTTP 200。**AI 增强走 UI 侧 fetch 可行** |

**实测带来的结论更新:**
- 项 7 从"需确认"→**已定论**:通信用裸对象,UI 侧 `event.data.type` 直读。
- 项 8 从"高风险未知"→**已部分定论**:主线程无 fetch,但 **UI iframe 可 fetch**。
  - ⚠️ **Red Team 提醒(CORS)**:8b 测的是 `api.github.com`(公开 GET、允许跨域)。真实 OpenAI 调用是带 `Authorization` 的 POST,**目标服务必须返回 CORS 头**才能在 UI iframe 直连。OpenAI 官方端点通常**不允许浏览器跨域**;实际部署多走「OpenAI-compatible 代理 / 企业网关」(允许 CORS)或「导出后交外部 AI」。这一点必须在 AI 设置页明示用户。
- 环境补充:`apiVersion="1.0"`、canvas 下 `command=""`、`navigator.clipboard` 不可用(诊断复制走文本框兜底)。

### 6.2 研发模式(DevMode)实跑结果 — ⏳ 待回填(重点:项 5 codegen)
```
(待回填)
```

---

## 7. 下一步(Step 2 预告)

待实跑结果回填、本报告定稿后,进入 **Step 2:冻结数据包 Schema**:
- `package-schema.ts` / `page-graph.ts` / `interaction.ts` / `quality-report.ts` / `ai-settings.ts`
- 其中 `dataStatus` 降级状态、`reactions` 原型信号、`confidence` 置信度三处需依据本报告结论设计。
