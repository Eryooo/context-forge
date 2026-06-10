// ============================================================
// 主流程编排器 — 串联所有模块,生成完整数据包
// 这是插件核心逻辑,协调 collector → identifier → inference → quality → export
// ============================================================

import type { AIContextPackage, PackageMeta, ProjectInfo, CollectionStats } from '../schema/package-schema'
import type { PageNode, PageList, PageGraph, PageGroup, PageChild } from '../schema/page-graph'
import type { InteractionGraph, Interaction } from '../schema/interaction'
import type { QualityReport } from '../schema/quality-report'
import type { AISettings } from '../schema/ai-settings'

import {
  getSelection,
  getCurrentPageTopLevelNodes,
  identifyPageCandidates,
  summarizeNode,
  exportScreenshot,
  collectDSL,
  collectHTML,
  uint8ArrayToBase64,
} from './collector'

import {
  classifyPageType,
  isModal,
  isDrawer,
  detectStatePages,
  isComponentLibrary,
  generatePageSummary,
  identifyEntryPage,
} from './page-identifier'

import {
  findInteractionCandidates,
  inferInteraction,
  generateUnresolvedQuestions,
  inferStateRelations,
} from './relation-inference'

import { runQualityChecks } from './quality-checker'
import { exportPackage } from './exporter'
import type { ExportOptions } from '../schema/package-schema'

// ========== 进度回调(供 UI 展示进度) ==========

export interface ProgressCallback {
  (phase: string, current: number, total: number, message: string): void
}

// ========== 主流程:生成 AI 数据包 ==========

export async function generateAIContextPackage(
  projectName: string,
  projectDescription: string,
  exportMode: 'selected_frames' | 'current_page' | 'whole_document',
  aiSettings?: AISettings,
  prdContext?: any,
  onProgress?: ProgressCallback
): Promise<AIContextPackage> {

  const startTime = Date.now()

  // ========== Phase 1: 选区读取与候选页面识别 ==========

  onProgress?.('选区读取', 0, 5, '正在读取选区节点...')

  let sourceNodes: ReadonlyArray<SceneNode> = []
  if (exportMode === 'selected_frames') {
    sourceNodes = getSelection()
    if (sourceNodes.length === 0) {
      throw new Error('未选中任何节点。请在画布中选择要导出的 Frame,或切换到"当前页面"模式。')
    }
  } else if (exportMode === 'current_page') {
    sourceNodes = getCurrentPageTopLevelNodes()
  } else {
    // whole_document 模式(未实现,先当 current_page)
    sourceNodes = getCurrentPageTopLevelNodes()
  }

  onProgress?.('页面识别', 1, 5, '正在识别页面候选...')

  const pageCandidates = identifyPageCandidates(sourceNodes)

  // 调试日志:记录候选页面
  console.log('[orchestrator] 页面候选数:', pageCandidates.length)
  pageCandidates.forEach((n, i) => {
    console.log(`  [${i}] ${n.name} (id=${n.id}, type=${n.type})`)
  })

  // 过滤组件库
  const validPages = pageCandidates.filter(node => !isComponentLibrary(node))

  console.log('[orchestrator] 有效页面数(过滤组件库后):', validPages.length)

  if (validPages.length === 0) {
    throw new Error('未识别出任何页面。请确认选中的节点包含有效页面(Frame/Section/设备尺寸节点)。')
  }

  // ========== Phase 2: 采集每个页面的数据(DSL/HTML/截图) ==========

  onProgress?.('数据采集', 2, 5, `正在采集 ${validPages.length} 个页面的数据...`)

  const pageNodes: PageNode[] = []
  const collectionStats: CollectionStats = {
    totalNodes: 0,
    selectedNodes: sourceNodes.length,
    pagesIdentified: validPages.length,
    dslSuccess: 0,
    dslFallback: 0,
    htmlSuccess: 0,
    htmlFallback: 0,
    screenshotSuccess: 0,
    interactionsCandidates: 0,
    interactionsConfirmed: 0,
  }

  // 临时存储截图和 DSL/HTML(后续打包时用)
  const screenshotsMap = new Map<string, string>() // pageId → base64
  const dslMap = new Map<string, any>() // pageId → dsl
  const htmlMap = new Map<string, string>() // pageId → html

  for (let i = 0; i < validPages.length; i++) {
    const node = validPages[i]
    const pageId = `page_${node.id}`

    onProgress?.('数据采集', 2, 5, `采集页面 ${i + 1}/${validPages.length}: ${node.name}`)

    // 基础摘要
    const nodeSummary = summarizeNode(node)

    // 页面类型识别
    const { type, confidence } = classifyPageType(node, nodeSummary)

    // DSL 采集(三层降级)
    const dslResult = await collectDSL(node)
    dslMap.set(pageId, dslResult.dsl)
    if (dslResult.status === 'success') collectionStats.dslSuccess++
    else if (dslResult.status === 'fallback') collectionStats.dslFallback++

    // HTML 采集(不阻断)
    const htmlResult = await collectHTML(node.id)
    if (htmlResult.html) {
      htmlMap.set(pageId, htmlResult.html)
      collectionStats.htmlSuccess++
    } else {
      collectionStats.htmlFallback++
    }

    // 截图采集
    const screenshotResult = await exportScreenshot(node)
    let screenshotStatus = screenshotResult?.status || 'failed'
    if (screenshotResult && screenshotResult.data.length > 0) {
      const base64 = uint8ArrayToBase64(screenshotResult.data)
      screenshotsMap.set(pageId, base64)
      collectionStats.screenshotSuccess++
    }

    // 页面摘要
    const summary = generatePageSummary(node, nodeSummary)

    const pageNode: PageNode = {
      pageId,
      pageName: node.name || `未命名页面${i + 1}`,
      pageType: type,
      nodeId: node.id,
      dslRef: `pages/${pageId}/dsl.json`,
      htmlRef: htmlResult.html ? `pages/${pageId}/html.html` : undefined,
      screenshotRef: `pages/${pageId}/screenshot.png`,
      dslStatus: dslResult.status,
      htmlStatus: htmlResult.status,
      screenshotStatus,
      summary,
      typeConfidence: confidence,
      userConfirmed: false,
      userModified: false,
    }

    pageNodes.push(pageNode)
  }

  // ========== Phase 3: 关系推断 ==========

  onProgress?.('关系推断', 3, 5, '正在推断页面间交互关系...')

  const interactions: Interaction[] = []

  // 检测状态页
  const statePages = detectStatePages(validPages)
  console.log('[orchestrator] 检测到状态页数:', statePages.length)
  statePages.forEach(s => {
    console.log(`  状态页: ${s.stateNode.name} → base: ${s.baseNode?.name || '(未找到)'}`)
  })

  for (const page of pageNodes) {
    const node = validPages.find(n => n.id === page.nodeId)
    if (!node) continue

    // 找候选交互(按钮/链接/表单)
    const candidates = findInteractionCandidates(node, page.pageId)
    collectionStats.interactionsCandidates += candidates.length

    console.log(`[orchestrator] 页面"${page.pageName}"找到 ${candidates.length} 个候选交互`)
    if (candidates.length > 0) {
      candidates.slice(0, 3).forEach(c => {
        console.log(`  - ${c.triggerElement} (${c.triggerElementType})`)
      })
    }

    // 推断每个候选
    for (const candidate of candidates) {
      const inter = inferInteraction(candidate, pageNodes)
      if (inter) {
        interactions.push(inter)
        console.log(`    → 推断出关系: ${inter.actionType}, 置信度=${inter.confidence.toFixed(2)}`)
      }
    }
  }

  // 状态关系推断
  for (const { stateNode, baseNode, stateType } of statePages) {
    const statePage = pageNodes.find(p => p.nodeId === stateNode.id)
    const base = baseNode ? pageNodes.find(p => p.nodeId === baseNode.id) : undefined
    if (statePage && base) {
      const stateRelations = inferStateRelations(base, [statePage])
      interactions.push(...stateRelations)
    }
  }

  // 生成待确认问题
  const unresolvedQuestions = generateUnresolvedQuestions(interactions, pageNodes)

  // 统计
  const highConfCount = interactions.filter(i => i.confidence >= 0.85).length
  const medConfCount = interactions.filter(i => i.confidence >= 0.6 && i.confidence < 0.85).length
  const lowConfCount = interactions.filter(i => i.confidence < 0.6).length
  const userConfCount = interactions.filter(i => i.confirmedByUser).length
  collectionStats.interactionsConfirmed = userConfCount

  // ========== Phase 4: 构建页面图谱(分组+流程) ==========

  onProgress?.('页面分组', 4, 5, '正在构建页面流程...')

  // 识别主页面 vs 浮层 vs 状态
  const mainPages = pageNodes.filter(p =>
    !p.pageType.startsWith('state_') &&
    p.pageType !== 'modal' &&
    p.pageType !== 'drawer' &&
    p.pageType !== 'component'
  )

  const overlays = pageNodes.filter(p => p.pageType === 'modal' || p.pageType === 'drawer')
  const states = pageNodes.filter(p => p.pageType.startsWith('state_'))
  const unknowns = pageNodes.filter(p => p.pageType === 'unknown' || p.pageType === 'component')

  // 简化分组:每个主页面一组,其关联的浮层和状态挂在下面
  const pageGroups: PageGroup[] = []
  for (const main of mainPages) {
    const group: PageGroup = {
      basePage: main.pageId,
      children: [],
    }

    // 找挂在该页面下的浮层(通过关系推断)
    const relatedOverlays = interactions.filter(i =>
      i.fromPage === main.pageId &&
      (i.actionType === 'openModal' || i.actionType === 'openDrawer') &&
      i.target
    ).map(i => i.target!)

    relatedOverlays.forEach(oid => {
      group.children.push({ pageId: oid, relationType: 'overlay' })
    })

    // 找挂在该页面下的状态页
    const relatedStates = interactions.filter(i =>
      i.fromPage === main.pageId &&
      i.interactionType === 'state' &&
      i.target
    ).map(i => i.target!)

    relatedStates.forEach(sid => {
      group.children.push({ pageId: sid, relationType: 'state' })
    })

    pageGroups.push(group)
  }

  // 识别入口页
  const entryPageId = identifyEntryPage(pageNodes)

  // 主流程(简化:按主页面顺序排,入口页在最前)
  const mainFlow = mainPages.map(p => p.pageId)
  if (entryPageId && mainFlow.includes(entryPageId)) {
    mainFlow.splice(mainFlow.indexOf(entryPageId), 1)
    mainFlow.unshift(entryPageId)
  }

  const pageGraph: PageGraph = {
    entryPage: entryPageId,
    mainFlow,
    pageGroups,
    unclassified: unknowns.map(p => p.pageId),
    totalPages: pageNodes.length,
    mainPageCount: mainPages.length,
    overlayCount: overlays.length,
    stateCount: states.length,
    unknownCount: unknowns.length,
  }

  const interactionGraph: InteractionGraph = {
    interactions,
    unresolvedQuestions,
    totalInteractions: interactions.length,
    highConfidenceCount: highConfCount,
    mediumConfidenceCount: medConfCount,
    lowConfidenceCount: lowConfCount,
    userConfirmedCount: userConfCount,
  }

  // ========== Phase 5: 构建完整数据包 ==========

  onProgress?.('质量检查', 5, 5, '正在运行质量检查...')

  const packageMeta: PackageMeta = {
    schemaVersion: '1.0.0',
    exportTool: 'MasterGo AI Context Packager',
    exportMode,
    exportedAt: Date.now(),
    aiEnhanced: aiSettings?.enabled || false,
    buildId: 'probe-3', // 当前构建号
  }

  const project: ProjectInfo = {
    name: projectName,
    description: projectDescription,
    documentId: (mg as any).documentId,
  }

  const pkg: AIContextPackage = {
    packageMeta,
    project,
    pageList: { pages: pageNodes },
    pageGraph,
    interactionGraph,
    prdContext,
    qualityReport: {} as QualityReport, // 先占位,下面填充
    aiSettings,
    collectionStats,
    aiExecutionInstruction: {
      targetTool: 'generic',
      generationTarget: 'interactive_html_demo',
      techStack: 'html_css_javascript',
      outputRequirement: '外部 AI 工具需要基于该数据包生成完整可运行 HTML Demo',
    },
  }

  // 运行质量检查
  pkg.qualityReport = runQualityChecks(pkg)

  // 最终汇总日志(供诊断快照查看)
  console.log('[orchestrator] ===== 最终结果汇总 =====')
  console.log(`  页面数: ${pageNodes.length}`)
  pageNodes.forEach(p => {
    console.log(`    - "${p.pageName}" type=${p.pageType} conf=${p.typeConfidence.toFixed(2)}`)
  })
  console.log(`  交互关系数: ${interactions.length}`)
  console.log(`  主流程: ${mainFlow.map(id => pageNodes.find(p => p.pageId === id)?.pageName).join(' → ')}`)
  console.log(`  质量评分: ${pkg.qualityReport.score}`)

  onProgress?.('完成', 5, 5, `数据包生成完成(${Date.now() - startTime}ms)`)

  return pkg
}

// ========== 快捷导出(生成数据包 + 立刻导出为指定格式) ==========

export async function quickExport(
  projectName: string,
  projectDescription: string,
  exportMode: 'selected_frames' | 'current_page' | 'whole_document',
  format: 'prompt' | 'json' | 'markdown',
  aiSettings?: AISettings,
  prdContext?: any,
  onProgress?: ProgressCallback
): Promise<string> {
  const pkg = await generateAIContextPackage(
    projectName,
    projectDescription,
    exportMode,
    aiSettings,
    prdContext,
    onProgress
  )

  const options: ExportOptions = {
    format,
    includePRD: !!prdContext,
    includeScreenshots: true,
    compressPrompt: false,
  }

  return exportPackage(pkg, options)
}
