// ============================================================
// 主线程入口 — 真实插件业务逻辑 + 常驻调试面板
// 从 Step 1 probe 改造而来,保留诊断能力,增加真实业务。
// ============================================================

import { sendMsgToUI, PluginMessage, UIMessage } from '@messages/sender'
import type { EnvInfo } from '@messages/sender'
import { quickExport, generateAIContextPackage } from '@modules/orchestrator'
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

      case UIMessage.LOAD_SETTINGS: {
        // 加载 AI 设置(从 clientStorage)
        const settings = await mg.clientStorage.getAsync('ai_settings')
        sendMsgToUI({
          type: PluginMessage.SETTINGS_LOADED,
          data: settings || null,
        })
        break
      }

      case UIMessage.SAVE_SETTINGS: {
        // 保存 AI 设置
        await mg.clientStorage.setAsync('ai_settings', msg.data)
        sendMsgToUI({
          type: PluginMessage.SETTINGS_SAVED,
          data: { success: true },
        })
        break
      }

      case UIMessage.CLEAR_SETTINGS: {
        // 清除 AI Key
        await mg.clientStorage.deleteAsync('ai_settings')
        sendMsgToUI({
          type: PluginMessage.SETTINGS_CLEARED,
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
const origLog = console.log.bind(console)
const origWarn = console.warn.bind(console)
const origError = console.error.bind(console)

console.log = (...args: any[]) => {
  origLog(...args)
  sendMsgToUI({ type: PluginMessage.LOG, data: { level: 'log', args } })
}
console.warn = (...args: any[]) => {
  origWarn(...args)
  sendMsgToUI({ type: PluginMessage.LOG, data: { level: 'warn', args } })
}
console.error = (...args: any[]) => {
  origError(...args)
  sendMsgToUI({ type: PluginMessage.LOG, data: { level: 'error', args } })
}

console.log('[main] 插件已启动,command=', safeGet(() => mg.command))

// 启动即上报环境信息
sendMsgToUI({ type: PluginMessage.ENV_INFO, data: collectEnvInfo() })
