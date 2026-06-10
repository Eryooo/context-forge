// ============================================================
// AI 增强模块 — OpenAI-compatible API 调用
// 重要:必须在 UI iframe 侧调用(主线程无 fetch,已 probe 验证)
// CORS 风险:OpenAI 官方端点可能拒绝浏览器跨域,需代理或兼容网关
// ============================================================

import type { AISettings } from '@schema/ai-settings'

export interface AICallResult {
  success: boolean
  content?: string
  error?: string
}

// 通用 OpenAI-compatible chat completion 调用
export async function callAI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string
): Promise<AICallResult> {
  if (!settings.enabled || !settings.apiKey) {
    return { success: false, error: 'AI 未启用或未配置 API Key' }
  }

  const url = `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`
  const controller = new AbortController()
  const timeout = settings.timeout || 60000
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: settings.temperature ?? 0.2,
        max_tokens: settings.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      }
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return { success: false, error: 'AI 返回空内容' }
    }

    return { success: true, content }
  } catch (e: any) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      return { success: false, error: `请求超时(${timeout}ms)` }
    }
    // CORS 错误通常表现为 TypeError: Failed to fetch
    if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
      return {
        success: false,
        error: 'CORS 拦截或网络错误。OpenAI 官方端点通常拒绝浏览器跨域,请用兼容代理/企业网关,或改用"导出后交外部 AI"模式。',
      }
    }
    return { success: false, error: String(e?.message || e) }
  }
}

// 测试连接(审计 5.4:给出 6 类明确失败原因)
// 优先用 /models GET(更轻、更能区分 Key/URL/CORS 问题)
export async function testAIConnection(settings: AISettings): Promise<AICallResult> {
  if (!settings.apiKey) {
    return { success: false, error: '未填写 API Key。' }
  }
  if (!settings.baseUrl) {
    return { success: false, error: '未填写 Base URL。' }
  }

  const url = `${settings.baseUrl.replace(/\/$/, '')}/models`
  const controller = new AbortController()
  const timeout = settings.timeout || 30000
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.status === 401 || res.status === 403) {
      return { success: false, error: '① API Key 错误或无权限(HTTP ' + res.status + ')。' }
    }
    if (res.status === 404) {
      return { success: false, error: '② Base URL 路径不正确(/models 返回 404),请检查是否为 OpenAI-compatible 端点。' }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `服务端返回 HTTP ${res.status}: ${text.slice(0, 120)}` }
    }
    // 成功:尝试确认模型是否存在(非强制)
    return { success: true, content: '连接成功(/models 可访问)。' }
  } catch (e: any) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      return { success: false, error: `④ 当前网络无法访问(请求超时 ${timeout}ms)。` }
    }
    if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
      return {
        success: false,
        error:
          '③/⑤ 服务端未开启 CORS 或浏览器跨域被拦截。OpenAI 官方端点通常不允许浏览器直连,请改用支持 CORS 的兼容代理/企业网关,或导出数据包后交外部 AI。',
      }
    }
    return { success: false, error: '⑥ 未知错误: ' + String(e?.message || e) }
  }
}

// ========== AI 增强能力(可选,失败回退本地规则) ==========

// 1. 页面语义增强(根据页面摘要,推断更准确的页面类型和用途)
export async function enhancePageSemantics(
  settings: AISettings,
  pageName: string,
  summary: string
): Promise<AICallResult> {
  return callAI(
    settings,
    '你是 UI 设计分析专家。根据页面名称和结构摘要,判断页面类型和核心用途。简洁回答。',
    `页面名称:${pageName}\n结构摘要:${summary}\n\n请判断:1)页面类型 2)核心用途(一句话)`
  )
}

// 2. PRD 摘要(把长 PRD 压缩成结构化业务规则)
export async function summarizePRD(
  settings: AISettings,
  rawPRD: string
): Promise<AICallResult> {
  return callAI(
    settings,
    '你是产品分析专家。把 PRD 提炼成简洁的业务规则列表。',
    `PRD 原文:\n${rawPRD.slice(0, 8000)}\n\n请提炼:1)核心业务规则(列表)2)关键约束条件`
  )
}

// 3. Prompt 压缩(把过长的数据包 Prompt 压缩)
export async function compressPrompt(
  settings: AISettings,
  longPrompt: string
): Promise<AICallResult> {
  return callAI(
    settings,
    '你是技术文档专家。在保留所有关键信息(页面/交互/约束)的前提下,压缩以下 Prompt。',
    `原始 Prompt:\n${longPrompt.slice(0, 12000)}\n\n请压缩,保留页面清单、交互关系、关键约束。`
  )
}
