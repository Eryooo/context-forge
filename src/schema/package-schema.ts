// ============================================================
// 数据包顶层 Schema — 汇总所有模块(PRD §11.3)
// ============================================================

import type { AISettings } from './ai-settings'
import type { PageGraph, PageList } from './page-graph'
import type { InteractionGraph } from './interaction'
import type { QualityReport } from './quality-report'
import type { DataStatus } from './page-graph'

// 数据包元信息
export interface PackageMeta {
  schemaVersion: string         // e.g. "1.0.0"
  exportTool: string            // "MasterGo AI Context Packager"
  exportMode: 'selected_frames' | 'current_page' | 'whole_document'
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
  rawPRD?: string               // 原始 PRD 全文(可选)
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

  // 质量与配置
  qualityReport: QualityReport
  aiSettings?: AISettings       // AI 配置(如果启用)

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
  includeScreenshots: boolean   // 是否包含截图
  compressPrompt: boolean       // 是否压缩 Prompt(需 AI)
  targetTool?: AIExecutionInstruction['targetTool']
}
