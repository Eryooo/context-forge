# PRD 功能追溯矩阵 (PRD Traceability Matrix)

> 用途:把两份 PRD 文档(《产品方案》《开发手册》)的**每一项功能**映射到开发 Step,
> 标注当前实现状态,作为防偏差的对照清单。每完成一个 Step 回来更新本表。
>
> **当前位置:Step 1(API 探测 Spike)即将收尾。业务功能尚未开始,符合"报告完成前不开发业务功能"的约束。**

## 图例
- ✅ 已实现并验证
- 🟡 部分 / 脚手架
- ⬜ 未开始(按计划在后续 Step)
- 🔧 探测工具临时件(定稿删除)

---

## A. 数据采集层(PRD §7 / 功能架构"自动数据采集")

| 功能 | 对应 Step | 状态 | 备注 |
|---|---|---|---|
| 读取范围选择(选区/画布/容器/勾选页面) | Step 3 | ⬜ | 探测已证明选区可读;正式采集器未写 |
| 节点树遍历 + 序列化 | Step 3 | ⬜ | 探测已证明 findAll 可用 |
| 样式摘要采集 | Step 3 | ⬜ | 探测已证明 fills/cornerRadius 等可读 |
| 文本内容采集 | Step 3 | ⬜ | 探测已证明 TEXT.characters 可读 |
| 组件实例采集 | Step 4 | ⬜ | InstanceNode.mainComponent 可读(已知) |
| 截图采集 | Step 3 | ⬜ | 探测已证明 exportAsync 可用 |
| **DSL 采集** | Step 3 | ⬜ | 三层降级链路待实现,见 §K |
| **HTML / D2C 采集** | Step 3 | ⬜ | 不可作硬依赖,失败标 unavailable,见 §K |
| 资源信息采集 | Step 10 | ⬜ | 后置 |

## B. 自动语义识别(PRD 功能架构"自动语义识别")

| 功能 | 对应 Step | 状态 | 备注 |
|---|---|---|---|
| 页面识别(候选页面规则) | Step 4 | ⬜ | |
| 页面类型识别(entry/home/list/detail/form/modal/drawer/state_*/...) | Step 4 | ⬜ | PRD §8.2 枚举 |
| 弹窗 / 抽屉识别 | Step 4 | ⬜ | |
| 状态页识别(空/加载/错误/成功) | Step 4 | ⬜ | |
| 组件识别 | Step 4 | ⬜ | |
| 区域识别 / 关键元素识别 | Step 4 | ⬜ | |

## C. 自动关系推断(PRD §7 / §8 — 你特别问到的"推断")

| 功能 | 对应 Step | 状态 | 备注 |
|---|---|---|---|
| **navigation 真实页面跳转** | Step 5 | ⬜ | |
| **overlay 弹窗/抽屉/浮层** | Step 5 | ⬜ | |
| **state 状态变体** | Step 5 | ⬜ | |
| **process 业务流程** | Step 5 | ⬜ | 多步骤流程编排数据结构 |
| 三层推断机制(规则→AI→用户确认) | Step 5(规则)/ Step 8(AI) | ⬜ | 规则优先,AI 后置 |
| 置信度评分(高/中/低) | Step 5 | ⬜ | 高≥0.85 批量确认;低<0.6 入问题队列 |
| 待确认问题队列 | Step 5/6 | ⬜ | |
| 利好信号:原型连线 reactions | Step 5 | ⬜ | **探测确认 ReactionMixin.reactions 可读,高价值** |

## D. 页面流程确认 UI(PRD §10.4 — 你特别问到的"流程编排")

| 功能 | 对应 Step | 状态 | 备注 |
|---|---|---|---|
| 首页(选择状态 + 一键生成) | Step 6 | ⬜ | |
| 读取进度页 | Step 6 | ⬜ | |
| 页面识别结果页(分组:主页面/浮层/状态/未归属) | Step 6 | ⬜ | |
| **页面流程确认页(核心:主流程 + 挂载关系 + 待确认问题)** | Step 6 | ⬜ | PRD 称"插件最关键的页面" |
| **关系卡片编辑页(自然语言描述每条关系)** | Step 6 | ⬜ | MVP 用卡片列表,**复杂流程图后置(优先级#3)** |
| 批量确认 / 修改 / 删除 / 新增关系 | Step 6 | ⬜ | |

## E. AI 增强(PRD §6 / §10.7)

| 功能 | 对应 Step | 状态 | 备注 |
|---|---|---|---|
| OpenAI-compatible API 配置(baseUrl/key/model) | Step 8 | ⬜ | 探测确认 UI iframe fetch 可用(注意 CORS) |
| 测试连接 / 启用开关 / 清除 Key | Step 8 | ⬜ | |
| 页面语义 / 关系 / PRD摘要 / Prompt压缩 / 质量校验增强 | Step 8 | ⬜ | **AI 全部后置(优先级#1)** |

## F. PRD 上下文补充(PRD §10.6) — Step 6 | ⬜

## G. 数据包生成(PRD §11)

| 功能 | 对应 Step | 状态 | 备注 |
|---|---|---|---|
| Prompt 生成 / 复制 | Step 7 | ⬜ | **优先(优先级#2)** |
| JSON 导出 | Step 7 | ⬜ | **优先** |
| Markdown 导出 | Step 7 | ⬜ | |
| ZIP 导出 | Step 10 | ⬜ | **后置(优先级#2)** |
| Claude Code/Codex/Cursor 指令 | Step 10 | ⬜ | 后置 |

## H. 数据质量检查(PRD §12) — Step 9 | ⬜
含 16 项检查 + QualityReport(score/blocking/warnings/unresolvedQuestions)

## I. 历史记录与配置复用 — Step 10 | ⬜ (探测确认 clientStorage 可用)

## J. 设置中心 — Step 8 | ⬜

## K. 降级机制(PRD §14.1 / 手册 §17 — 你特别问到的"降级方案")

| 降级链路 | 对应 Step | 状态 | 设计(已在 capability-report 固化) |
|---|---|---|---|
| DSL:codegen → 节点树DSL-like → 摘要+截图 | Step 3 | ⬜ | 探测确认 canvas 无 codegen,需降级 |
| HTML:可读则存,否则标 unavailable 不阻断 | Step 3 | ⬜ | |
| AI 调用失败 → 回退本地规则结果 | Step 8 | ⬜ | |
| 数据包过大 → 分包 / 摘要模式 | Step 10 | ⬜ | |
| 三种运行模式:完整 / 降级 / 极简 | Step 3 起贯穿 | ⬜ | |

## L. 分包机制(PRD §14.2) — Step 10 | ⬜ (后置)

---

## M. 探测工具临时件(定稿后删除)🔧

| 文件 / 代码 | 说明 |
|---|---|
| `ui/diag.ts` | 诊断采集 |
| `index.tsx` 顶部 installDiag | 诊断安装 |
| `App.tsx` 探测 UI / 复制诊断 | 探测界面 |
| `lib/main.ts` probeXxx 函数 | 8 项探测逻辑 |
| `messages/sender.ts` ProbeXxx 类型 | 探测协议 |

> 这些就是你截图里看到的全部内容。它们**不属于产品**,Step 2 起会被正式业务代码替换。

---

## 结论:有无偏差?

**无功能偏差。** PRD 的全部功能模块(A–L)都已登记,且都映射到了 Step 2–10 的计划中,没有任何一项被遗漏或删改。当前只完成 Step 1(探测),业务功能为 0,这是"报告完成前不开发业务功能"约束下的**正确状态**,不是漏做。

**唯一要警惕的偏差风险**:如果跳过 Step 2(冻结 Schema)直接写业务,会导致采集/识别/导出各模块数据结构不统一。因此严格按 Step 顺序执行。
