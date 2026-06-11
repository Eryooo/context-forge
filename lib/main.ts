// ============================================================
// 主线程入口 — 真实插件业务逻辑 + 常驻调试面板
// 从 Step 1 probe 改造而来,保留诊断能力,增加真实业务。
// ============================================================

import { sendMsgToUI, PluginMessage, UIMessage } from '@messages/sender'
import type { EnvInfo } from '@messages/sender'
import { quickExport, generateAIContextPackage } from '@modules/orchestrator'
import { redactArgs } from '@modules/security/redact'
import type { AISettings } from '@schema/ai-settings'
import type { PRDContext } from '@schema/package-schema'

// ========== 环境信息上报(启动时) ==========

function collectEnvInfo(): EnvInfo {
  return {
    apiVersion: safeGet(() => mg.apiVersion),
    command: safeGet(() => mg.command),
    themeColor: safeGet(() => mg.themeColor),
    documentId: safeGet(() => mg.documentId),
    hasCodegen: safeGet(() => typeof (mg as any).codegen !== 'undefined') ?? false,
    mainThreadHasFetch: typeof (globalThis as any).fetch === 'function',
  }
}

function safeGet<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

// ========== 主线程消息处理 ==========

mg.ui.onmessage = async (msg: { type: UIMessage; data?: any }) => {
  if (!msg || !msg.type) return

  try {
    switch (msg.type) {
      case UIMessage.PING: {
        // 调试:通信往返测试
        sendMsgToUI({
          type: PluginMessage.PONG,
          data: { echo: msg.data, mainReceivedAt: Date.now() },
        })
        break
      }

      case UIMessage.GENERATE_PACKAGE: {
        // 业务:生成 AI 数据包
        const {
          projectName,
          projectDescription,
          exportMode,
          aiSettings,
          prdContext,
        } = msg.data

        const pkg = await generateAIContextPackage(
          projectName,
          projectDescription,
          exportMode,
          aiSettings,
          prdContext,
          (phase, current, total, message) => {
            // 进度回调
            sendMsgToUI({
              type: PluginMessage.PROGRESS,
              data: { phase, current, total, message },
            })
          }
        )

        sendMsgToUI({
          type: PluginMessage.PACKAGE_GENERATED,
          data: pkg,
        })
        break
      }

      case UIMessage.EXPORT: {
        // 业务:快速导出(生成+导出一步完成)
        const {
          projectName,
          projectDescription,
          exportMode,
          format,
          aiSettings,
          prdContext,
        } = msg.data

        const result = await quickExport(
          projectName,
          projectDescription,
          exportMode,
          format,
          aiSettings,
          prdContext,
          (phase, current, total, message) => {
            sendMsgToUI({
              type: PluginMessage.PROGRESS,
              data: { phase, current, total, message },
            })
          }
        )

        sendMsgToUI({
          type: PluginMessage.EXPORT_DONE,
          data: { format, content: result },
        })
        break
      }

      case UIMessage.EXPORT_CURRENT_PACKAGE: {
        // R3-S1:导出当前已确认的 pkg(不重新生成,不丢用户编辑)
        const { pkg, format, includeRawPRD, targetTool } = msg.data

        const { exportPackage } = await import('@modules/exporter')

        // exportPackage 内部已统一做 sanitizePackageForExport + applyRawPRDPolicy(审计 P0)
        // 这里只需把当前 pkg + 用户选项传入,不重新读设计稿、不重新识别
        const result = exportPackage(pkg, {
          format: format as 'prompt' | 'json' | 'markdown',
          includePRD: true,
          includeRawPRD: includeRawPRD || false,
          includeScreenshots: true,
          compressPrompt: false,
          targetTool: targetTool || 'generic',
        })

        sendMsgToUI({
          type: PluginMessage.EXPORT_DONE,
          data: { format, content: result },
        })
        break
      }

      case UIMessage.LOAD_SETTINGS: {
        // R3-S14:命名空间 key + 版本号,兼容旧 key 迁移
        const SETTINGS_KEY = 'context-forge:ai-settings'
        let stored = await mg.clientStorage.getAsync(SETTINGS_KEY)
        // 迁移:旧 key 'ai_settings'(无版本包裹)
        if (!stored) {
          const legacy = await mg.clientStorage.getAsync('ai_settings')
          if (legacy) {
            stored = { version: 1, settings: legacy }
            await mg.clientStorage.setAsync(SETTINGS_KEY, stored)
            await mg.clientStorage.deleteAsync('ai_settings')
          }
        }
        const settings = stored?.settings ?? null
        sendMsgToUI({
          type: PluginMessage.SETTINGS_LOADED,
          data: settings,
        })
        break
      }

      case UIMessage.SAVE_SETTINGS: {
        // R3-S14:带版本号包裹
        await mg.clientStorage.setAsync('context-forge:ai-settings', {
          version: 1,
          settings: msg.data,
        })
        sendMsgToUI({
          type: PluginMessage.SETTINGS_SAVED,
          data: { success: true },
        })
        break
      }

      case UIMessage.CLEAR_SETTINGS: {
        // R3-S14:清除新旧 key
        await mg.clientStorage.deleteAsync('context-forge:ai-settings')
        await mg.clientStorage.deleteAsync('ai_settings')
        sendMsgToUI({
          type: PluginMessage.SETTINGS_CLEARED,
          data: { success: true },
        })
        break
      }

      case UIMessage.LOAD_PRD_DRAFT: {
        // 加载 PRD 草稿(按 documentId 隔离)
        const docId = safeGet(() => mg.documentId) ?? 'default'
        const key = `context-forge:prd-draft:${docId}`
        const draft = await mg.clientStorage.getAsync(key)
        sendMsgToUI({
          type: PluginMessage.PRD_DRAFT_LOADED,
          data: draft || null,
        })
        break
      }

      case UIMessage.SAVE_PRD_DRAFT: {
        // 保存 PRD 草稿。注意:UI 侧已剥离 rawPRD,这里再兜底剥离一次(B4)
        const docId = safeGet(() => mg.documentId) ?? 'default'
        const key = `context-forge:prd-draft:${docId}`
        const draft = { ...(msg.data || {}) }
        delete draft.rawPRD
        await mg.clientStorage.setAsync(key, draft)
        sendMsgToUI({
          type: PluginMessage.PRD_DRAFT_SAVED,
          data: { success: true },
        })
        break
      }

      case UIMessage.RUN_PROBES: {
        // 调试:运行 API 探测(保留 probe 功能,供调试用)
        // 这里简化版,只上报环境信息
        // 完整 probe 逻辑已在 Step 1 验证过,此处不再重复
        sendMsgToUI({
          type: PluginMessage.PROBE_RESULTS,
          data: {
            message: 'Probe 功能已简化,主要 API 能力已在 Step 1 验证通过。',
            env: collectEnvInfo(),
          },
        })
        break
      }

      case UIMessage.RUN_CODEGEN_PROBE: {
        // DevMode codegen 实测(审计 16 / P1-04)
        const result: any = { timestamp: Date.now(), tests: [] }
        result.tests.push({ name: 'mg.codegen 存在性', pass: typeof (mg as any).codegen !== 'undefined' })
        if ((mg as any).codegen) {
          try {
            // R3-S14:同时尝试两条选区路径,记录各自结果,避免误判 codegen 不可用
            const selA = safeGet(() => (mg as any).document?.currentPage?.selection)
            const selB = safeGet(() => (mg as any).currentPage?.selection)
            result.tests.push({ name: '选区路径 mg.document.currentPage.selection', pass: Array.isArray(selA), result: Array.isArray(selA) ? `${selA.length} 个` : '不可用' })
            result.tests.push({ name: '选区路径 mg.currentPage.selection', pass: Array.isArray(selB), result: Array.isArray(selB) ? `${selB.length} 个` : '不可用' })
            const sel = (Array.isArray(selA) && selA.length ? selA : null) || (Array.isArray(selB) && selB.length ? selB : null) || []
            if (sel.length === 0) {
              result.tests.push({ name: 'getDSL 可用性', pass: false, error: '未选中节点(请在 DevMode 下选中一个节点)' })
            } else {
              const node = sel[0]
              const dsl = await (mg as any).codegen.getDSL({ node })
              result.tests.push({ name: 'getDSL 可用性', pass: !!dsl, result: dsl ? 'OK' : 'null' })
              const code = await (mg as any).codegen.getCode({ node })
              result.tests.push({ name: 'getCode 可用性', pass: !!code, result: code ? code.slice(0, 100) : 'null' })
            }
          } catch (e: any) {
            result.tests.push({ name: 'codegen 调用', pass: false, error: e.message })
          }
        }
        sendMsgToUI({
          type: PluginMessage.CODEGEN_PROBE_RESULT,
          data: result,
        })
        break
      }

      default:
        console.warn('Unknown message type:', msg.type)
    }
  } catch (error: any) {
    console.error('Main thread error:', error)
    sendMsgToUI({
      type: PluginMessage.ERROR,
      data: {
        message: error?.message || String(error),
        stack: error?.stack,
      },
    })
  }
}

// ========== 启动 ==========

mg.showUI(__html__, { width: 520, height: 720 })

// 主线程日志转发到 UI(供调试面板捕获)
// 安全:转发前必须脱敏(redactArgs),防止 apiKey/rawPRD 等泄漏到 UI/调试快照。
const origLog = console.log.bind(console)
const origWarn = console.warn.bind(console)
const origError = console.error.bind(console)

console.log = (...args: any[]) => {
  origLog(...args)
  sendMsgToUI({ type: PluginMessage.LOG, data: { level: 'log', args: redactArgs(args) } })
}
console.warn = (...args: any[]) => {
  origWarn(...args)
  sendMsgToUI({ type: PluginMessage.LOG, data: { level: 'warn', args: redactArgs(args) } })
}
console.error = (...args: any[]) => {
  origError(...args)
  sendMsgToUI({ type: PluginMessage.LOG, data: { level: 'error', args: redactArgs(args) } })
}

console.log('[main] 插件已启动,command=', safeGet(() => mg.command))

// 启动即上报环境信息
sendMsgToUI({ type: PluginMessage.ENV_INFO, data: collectEnvInfo() })
