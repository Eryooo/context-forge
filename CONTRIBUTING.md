# 贡献指南

感谢你对 ContextForge 的关注!本文档说明如何参与开发。

## 项目定位(贡献前必读)

ContextForge 的边界是**严格**的,贡献时请遵守:

- ✅ 插件负责:读取、识别、推断、确认、打包、导出**设计上下文数据**
- ❌ 插件**不负责**:生成 HTML / React / Vue、运行原型、生产级 D2C
- 最终代码生成由外部 AI 工具(Claude Code / Codex / Cursor / ChatGPT)基于导出的数据包完成

任何让插件"直接生成代码"的 PR 都不符合项目定位。

## 开发环境

- Node.js ≥ 14.14
- npm(国内建议配置镜像源:`--registry=https://registry.npmmirror.com`)
- MasterGo 客户端(用于真机加载测试)

## 快速开始

```bash
# 1. 克隆并安装
git clone https://github.com/Eryooo/context-forge.git
cd context-forge
npm install

# 2. 类型检查
npm run typecheck

# 3. 构建
npm run build         # 若装了 yarn
npm run build:ui && npm run build:main   # 仅用 npm

# 4. 在 MasterGo 中加载
# 插件 → 开发 → 导入插件 → 选择 dist/manifest.json
```

## 项目结构

```
src/schema/      数据包 Schema(TypeScript 类型,改动需全局同步)
src/modules/     核心逻辑(采集/识别/推断/质量/导出/编排)
ui/              React UI(8 阶段流程 + 组件)
lib/main.ts      插件主线程入口(mg API 调用)
messages/        主线程 ↔ UI 通信协议
```

## 代码规范

1. **类型优先**:改 Schema 后必须 `npm run typecheck` 零错误
2. **纯函数**:质量检查、重算等核心逻辑保持纯函数,不修改入参
3. **降级不阻断**:DSL/HTML/截图采集失败时降级标记,不抛异常中断主流程
4. **安全红线**:
   - API Key 只存 clientStorage,绝不进数据包 / 导出 / console / 日志
   - rawPRD 默认不进草稿,导出受开关控制
   - 新增导出路径必须经 `sanitizePackageForExport`
5. **消息协议**:UI ↔ 主线程通信只用 `messages/sender.ts` 定义的强类型 enum

## 提交流程

1. Fork 仓库,从 `main` 切新分支(`feat/xxx` 或 `fix/xxx`)
2. 开发并确保:
   - `npm run typecheck` 通过
   - `npm run build` 通过
   - 真机加载验证(若涉及 UI / API)
3. 提交信息建议格式:`type(scope): 描述`(如 `feat(export): 支持 ZIP 导出`)
4. 推送并创建 PR,关联对应 Issue
5. PR 描述请包含:改了什么、为什么、如何验证

## 验证清单(PR 前自检)

- [ ] typecheck / build 通过
- [ ] 无 API Key / 敏感信息泄漏(导出包、console、日志)
- [ ] 改了 Schema 的,所有引用处已同步
- [ ] 新增 UI class 的,App.css 有对应样式(避免 UI 裸排)
- [ ] 新增消息的,UI 和主线程两端都已处理(避免死消息)
- [ ] 不违反"插件不生成代码"的边界

## 报告问题

提 Issue 时请附:
- MasterGo 版本 + 运行模式(设计模式 / 研发模式)
- 复现步骤
- 调试面板的"诊断快照"(底部 🔧 调试面板 → 复制诊断快照)

## License

贡献的代码默认采用 [MIT License](./LICENSE)。
