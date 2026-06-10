// ============================================================
// AI 增强配置 Schema
// MVP 后置到 Step 8,但 Schema 先冻结。
// ============================================================

export interface AISettings {
  enabled: boolean
  provider: 'openai-compatible' | 'custom'
  baseUrl: string // e.g. "https://api.openai.com/v1"
  apiKey: string  // 仅存 clientStorage,可清除
  model: string   // e.g. "gpt-4", "deepseek-chat"
  temperature?: number
  maxTokens?: number
  timeout?: number // ms

  // 用途开关
  usages: {
    pageSemantics: boolean      // 页面语义识别增强
    relationInference: boolean  // 关系推断增强
    prdSummary: boolean        // PRD 摘要
    promptCompression: boolean // Prompt 压缩
    qualityCheck: boolean      // 质量校验
  }
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4',
  temperature: 0.2,
  maxTokens: 4096,
  timeout: 60000,
  usages: {
    pageSemantics: true,
    relationInference: true,
    prdSummary: true,
    promptCompression: true,
    qualityCheck: true,
  },
}

// CORS 风险提醒文案(需在 AI 设置页展示)
export const CORS_WARNING = `
⚠️ 网络限制提示:
MasterGo 插件的 UI iframe 可以发起 fetch 请求,但受 CORS 限制。
OpenAI 官方端点(api.openai.com)通常不允许浏览器跨域请求。

推荐方案:
1. 使用支持 CORS 的 OpenAI-compatible 代理或企业网关
2. 或导出数据包后,交由 Claude Code / Cursor 等外部 AI 工具生成代码

如不确定,建议先测试连接,再启用 AI 增强。
`.trim()
