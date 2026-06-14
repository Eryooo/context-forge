# 安全策略 Security Policy

## 设计原则 Security by Design

ContextForge 处理设计稿数据并可能涉及 AI API Key,安全是核心设计目标。以下机制内建于插件:

### API Key 保护
- **永不进入数据包**:`AIContextPackage` 中无 `aiSettings` 字段,仅保留非敏感的 `aiEnhancement`(provider/model/usage 元信息)
- **仅本地存储**:API Key 通过 MasterGo `clientStorage` 存储,带命名空间 key + 版本号
- **导出前双重脱敏**:`sanitizePackageForExport` → `redactSensitive`,移除 apiKey/authorization/bearer/token/secret/password 等字段,并对字符串值做 `Bearer xxx` / `sk-xxx` / `github_pat_xxx` 模式脱敏
- **console 转发脱敏**:主线程日志转发到 UI 前先 redact,避免 Key 出现在调试快照

### PRD 数据保护
- **rawPRD 不入草稿**:原始 PRD 默认不存入本地草稿
- **导出开关控制**:rawPRD 是否进入导出包由用户显式开关决定(`applyRawPRDPolicy`)

### 数据最小化
- 排除的页面(`excluded`)在导出时全链路移除(`stripExcludedPages`),不泄漏到 JSON/Prompt/Markdown

## 支持的版本 Supported Versions

| 版本 | 支持状态 |
|------|---------|
| 0.3.x | ✅ 积极维护 |
| < 0.3 | ❌ 不再维护 |

## 报告漏洞 Reporting a Vulnerability

如果你发现安全漏洞,请**不要**直接提交公开 Issue。

请通过以下方式私下报告:
- 在 GitHub 仓库使用 [Security Advisories](https://github.com/Eryooo/context-forge/security/advisories/new) 私密报告
- 或在 Issue 中标注 `[SECURITY]` 并仅描述影响范围,不公开 PoC 细节

我们会在确认后尽快修复并致谢。

## 安全检查清单(贡献者)

提交涉及导出 / 存储 / 日志的代码前,请确认:
- [ ] 新增导出路径经过 `sanitizePackageForExport`
- [ ] 不在 console / 日志 / 数据包中输出 API Key 或 token
- [ ] 新增存储字段不含敏感信息,或已纳入脱敏白名单
- [ ] rawPRD 等敏感内容受导出开关控制
