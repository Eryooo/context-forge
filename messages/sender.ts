// ============================================================
// MasterGo AI Context Packager — 消息协议(真实业务版)
// 从 probe 协议扩展而来,增加业务消息,保留调试能力。
// ============================================================

import type { AIContextPackage } from '@schema/package-schema'
import type { AISettings } from '@schema/ai-settings'
import type { PRDContext } from '@schema/package-schema'

// ========== 探测结果(调试用,保留) ==========

export type ProbeStatus = 'ok' | 'degraded' | 'unavailable' | 'error'

export interface ProbeResult {
  id: string
  title: string
  status: ProbeStatus
  summary: string
  detail?: string
  evidence?: unknown
  elapsedMs?: number
}

// ========== 环境信息 ==========

export interface EnvInfo {
  apiVersion?: string
  command?: string
  themeColor?: string
  documentId?: number
  hasCodegen: boolean
  mainThreadHasFetch: boolean
}

// ========== UI → 主线程消息 ==========

export enum UIMessage {
  // 业务消息
  GENERATE_PACKAGE = 'GENERATE_PACKAGE',   // 生成数据包
  EXPORT = 'EXPORT',                       // 快速导出(生成+导出)
  LOAD_SETTINGS = 'LOAD_SETTINGS',         // 加载 AI 设置
  SAVE_SETTINGS = 'SAVE_SETTINGS',         // 保存 AI 设置
  CLEAR_SETTINGS = 'CLEAR_SETTINGS',       // 清除 AI Key

  // 调试消息(保留)
  RUN_PROBES = 'RUN_PROBES',
  PING = 'PING',
}

// ========== 主线程 → UI 消息 ==========

export enum PluginMessage {
  // 环境与状态
  ENV_INFO = 'ENV_INFO',

  // 业务消息
  PROGRESS = 'PROGRESS',                   // 进度更新
  PACKAGE_GENERATED = 'PACKAGE_GENERATED', // 数据包生成完成
  EXPORT_DONE = 'EXPORT_DONE',             // 导出完成
  SETTINGS_LOADED = 'SETTINGS_LOADED',     // 设置已加载
  SETTINGS_SAVED = 'SETTINGS_SAVED',       // 设置已保存
  SETTINGS_CLEARED = 'SETTINGS_CLEARED',   // 设置已清除
  ERROR = 'ERROR',                         // 错误

  // 调试消息(保留)
  PROBE_RESULTS = 'PROBE_RESULTS',
  PONG = 'PONG',
  LOG = 'LOG',                              // 主线程日志转发(调试用)
}

// ========== 消息载荷 ==========

export interface ProgressPayload {
  phase: string
  current: number
  total: number
  message: string
}

export interface ExportDonePayload {
  format: 'prompt' | 'json' | 'markdown'
  content: string
}

export interface ErrorPayload {
  message: string
  stack?: string
}

export interface MessagePayload {
  type: UIMessage | PluginMessage
  data?: any
}

// ========== 消息发送辅助 ==========

export const sendMsgToUI = (msg: MessagePayload) => {
  mg.ui.postMessage(msg, '*')
}

export const sendMsgToPlugin = (msg: MessagePayload) => {
  parent.postMessage(msg, '*')
}
