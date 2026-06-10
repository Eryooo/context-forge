// ============================================================
// 数据包顶层 Schema — 汇总所有模块(PRD §11.3)
// 安全约束:本文件定义的 AIContextPackage 会被导出为 JSON/Prompt/MD,
// 因此严禁包含任何敏感字段(apiKey 等)。AI 配置只用 AIEnhancementMeta(非敏感元信息)。
// ============================================================

import type { PageGraph, PageList } from './page-graph'
import type { InteractionGraph } from './interaction'
import type { QualityReport } from './quality-report'
import type { DataStatus } from './page-graph'

// 导出范围(审计 4.3:扩展为 6 值,覆盖真实使用场景)
export type ExportMode =
  | 'selected_nodes'              // 选中的任意节点
  | 'selected_frames'            // 选中的 Frame
  | 'current_page_top_frames'    // 当前页面顶层 Frame
  | 'container_children'         // 容器(Section)内顶层页面
  | 'manual_selected_pages'      // UI 手动勾选页面
  | 'flow_group'                 // 按流程分组

// 数据包元信息
export interface PackageMeta {
  schemaVersion: string         // e.g. "1.0.0"
  exportTool: string            // "ContextForge"
  exportMode: ExportMode
  exportedAt: number            // 时间戳
  aiEnhanced: boolean           // 是否启用了 AI 增强
  buildId?: string              // 插件构建号(调试用)
}

// 项目信息
export interface ProjectInfo {
  name: string                  // e.g. "任务管理系统 MVP"
  description: string           // e.g. "用于生成可交互 HTML Demo 的 MasterGo 设计上下文数据包"
  documentId?: number           // MasterGo 文档 ID
}

// PRD 上下文(用户补充)
export interface PRDContext {
  summary?: string              // PRD 摘要
  businessRules?: string[]      // 业务规则列表
  userStories?: string[]        // 用户故事
  acceptanceCriteria?: string[] // 验收标准
  specialRules?: string[]       // 特殊规则
  rawPRD?: string               // 原始 PRD 全文(可选;默认不进历史记录;导出由用户勾选)
}

// 数据采集状态统计
export interface CollectionStats {
  totalNodes: number            // 总节点数(遍历到的)
  selectedNodes: number         // 选中节点数
  pagesIdentified: number       // 识别出的页面数
  dslSuccess: number            // DSL 成功数
  dslFallback: number           // DSL 降级数
  htmlSuccess: number           // HTML 成功数
  htmlFallback: number          // HTML 降级数
  screenshotSuccess: number     // 截图成功数
  interactionsCandidates: number // 候选交互数
  interactionsConfirmed: number  // 已确认交互数
}

// AI 执行指令(告诉外部 AI 工具做什么)
export interface AIExecutionInstruction {
  targetTool: 'claude_code' | 'codex' | 'cursor' | 'chatgpt' | 'generic'
  generationTarget: 'interactive_html_demo' | 'react_app' | 'vue_app' | 'design_doc'
  techStack?: string            // e.g. "html_css_javascript", "react_typescript"
  outputRequirement: string     // e.g. "外部 AI 工具需要基于该数据包生成完整可运行 HTML Demo"
}

// ============================================================
// AI 增强元信息(安全:不含 apiKey/baseUrl 等敏感字段)
// 取代原 aiSettings 字段,可安全进入导出包。
// ============================================================
export interface AIEnhancementMeta {
  enabled: boolean
  provider?: string             // e.g. "openai-compatible"
  model?: string                // e.g. "gpt-4"(模型名非敏感)
  usages?: {
    pageSemantics: boolean
    relationInference: boolean
    prdSummary: boolean
    promptCompression: boolean
    qualityCheck: boolean
  }
}

// ============================================================
// 页面资产(审计 4.4 / §3:JSON 内联真实 DSL/HTML/截图,否则外部 AI 读不到)
// ============================================================
export interface PageAssets {
  dsl?: unknown                          // 真实 DSL 内容(codegen 或节点树 JSON)
  html?: string                          // 真实 HTML 内容(如可用)
  screenshotBase64?: string              // 截图 base64(仅进 JSON,不进 Prompt)
  screenshotMime?: 'image/png'
  dslSource?: 'codegen' | 'node_tree' | 'summary'  // DSL 来源(降级链路)
}

export interface PackageAssets {
  pages: Record<string, PageAssets>      // pageId → 资产
}

// 顶层数据包
export interface AIContextPackage {
  packageMeta: PackageMeta
  project: ProjectInfo

  // 核心数据
  pageList: PageList            // 页面清单(flat list)
  pageGraph: PageGraph          // 页面图谱(分组+流程)
  interactionGraph: InteractionGraph  // 交互关系

  // 上下文
  prdContext?: PRDContext       // PRD 补充(可选)

  // 真实资产(JSON 内联,外部 AI 可直接读)
  assets?: PackageAssets

  // 质量与配置
  qualityReport: QualityReport
  aiEnhancement?: AIEnhancementMeta  // AI 增强元信息(非敏感,取代 aiSettings)

  // 统计
  collectionStats: CollectionStats

  // 执行指令
  aiExecutionInstruction: AIExecutionInstruction
}

// 导出格式(不同工具需要不同格式)
export type ExportFormat = 'json' | 'markdown' | 'prompt' | 'zip'

// 导出选项
export interface ExportOptions {
  format: ExportFormat
  includePRD: boolean           // 是否包含 PRD
  includeRawPRD?: boolean       // 是否包含 rawPRD(默认 false,用户主动勾选)
  includeScreenshots: boolean   // 是否包含截图
  compressPrompt: boolean       // 是否压缩 Prompt(需 AI)
  targetTool?: AIExecutionInstruction['targetTool']
}
