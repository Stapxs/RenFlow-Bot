/**
 * 工作流执行引擎
 * 负责执行转换后的工作流
 */

import type { WorkflowExecution, ExecutionNode } from './types.js'
import type { NodeContext, NodeExecutionResult } from '../nodes/types.js'
import { NodeManager } from '../nodes/NodeManager.js'
import { Logger } from '../utils/logger.js'

export interface ExecutionContext {
    workflowId: string
    globalState: Map<string, any>
    triggerData: any
    logs: ExecutionLog[]
    loopStack: LoopRuntimeState[]
}

export interface ExecutionLog {
    timestamp: number
    nodeId: string
    level: 'log' | 'error' | 'warn'
    message: string
    data?: any
}

export interface WorkflowExecutionResult {
    success: boolean
    error?: string
    logs: ExecutionLog[]
    finalState: Map<string, any>
}

export interface ExecutionCallback {
    onNodeStart?: (nodeId: string, nodeType: string, input: any) => void | Promise<void>
    onNodeComplete?: (nodeId: string, result: NodeExecutionResult) => void | Promise<void>
    onNodeError?: (nodeId: string, error: Error) => void | Promise<void>
    onWorkflowComplete?: (result: WorkflowExecutionResult) => void | Promise<void>
}

export interface ExecutionOptions {
    minDelay?: number
    timeout?: number
    callback?: ExecutionCallback
    initialGlobals?: Record<string, any>
}

interface LoopRuntimeItem {
    mode: 'count' | 'iterate'
    index: number
    iteration: number
    count: number
    isFirst: boolean
    isLast: boolean
    item: any
    key?: string
    value?: any
}

interface LoopRuntimeState {
    startId: string
    endId: string
    bodyEntry: string
    exitNext: string | null
    originalInput: any
    resultMode: 'collect' | 'last'
    items: LoopRuntimeItem[]
    results: any[]
    broken: boolean
    currentIteration: number
    iterationCompleted: boolean
    iterationOutput: any
    endArrivals: any[]
    endExpected: number
}

export class WorkflowEngine {
    private nodeManager: NodeManager
    private logger: Logger
    private pendingMerge: Map<string, { inputs: any[]; expected: number; executed: boolean; timer?: any; params: Record<string, any> }>

    constructor() {
        this.nodeManager = new NodeManager()
        this.logger = new Logger('WorkflowEngine')
        this.pendingMerge = new Map()
    }

    async execute(
        workflow: WorkflowExecution,
        triggerData: any = null,
        options: ExecutionOptions = {}
    ): Promise<WorkflowExecutionResult> {
        this.logger.info(`开始执行工作流: ${workflow.name} (${workflow.id})`)

        const context: ExecutionContext = {
            workflowId: workflow.id,
            globalState: new Map(),
            triggerData,
            logs: [],
            loopStack: []
        }

        if (options.initialGlobals) {
            for (const [k, v] of Object.entries(options.initialGlobals)) {
                context.globalState.set(k, v)
            }
        }

        if (context.triggerData !== undefined && context.triggerData !== null) {
            context.globalState.set('trigger', context.triggerData)
        }

        const executePromise = this.executeInternal(workflow, context, options)

        if (options.timeout && options.timeout > 0) {
            const timeoutPromise = new Promise<WorkflowExecutionResult>((_, reject) => {
                setTimeout(() => reject(new Error(`执行超时 (${options.timeout}ms)`)), options.timeout)
            })

            try {
                return await Promise.race([executePromise, timeoutPromise])
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                const result: WorkflowExecutionResult = {
                    success: false,
                    error: errorMessage,
                    logs: context.logs,
                    finalState: context.globalState
                }
                await options.callback?.onWorkflowComplete?.(result)
                return result
            }
        }

        return executePromise
    }

    private async executeInternal(
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions
    ): Promise<WorkflowExecutionResult> {
        try {
            if (!workflow.entryNode) {
                throw new Error('工作流没有入口节点')
            }

            await this.executeNode(workflow.entryNode, context.triggerData, workflow, context, options)

            const result: WorkflowExecutionResult = {
                success: true,
                logs: context.logs,
                finalState: context.globalState
            }
            await options.callback?.onWorkflowComplete?.(result)
            return result
        } catch (error) {
            const result: WorkflowExecutionResult = {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                logs: context.logs,
                finalState: context.globalState
            }

            try {
                await options.callback?.onWorkflowComplete?.(result)
            } catch (cbErr) {
                this.logger.error('onWorkflowComplete callback error', cbErr as any)
            }

            return result
        }
    }

    private async executeNode(
        nodeId: string,
        input: any,
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions
    ): Promise<void> {
        const node = workflow.nodes[nodeId]
        if (!node) {
            throw new Error(`节点不存在: ${nodeId}`)
        }

        const startTime = Date.now()
        await options.callback?.onNodeStart?.(nodeId, node.type, input)

        const nodeContext: NodeContext = {
            nodeId: node.id,
            nodeType: node.type,
            globalState: context.globalState,
            logger: {
                log: (...args: any[]) => this.addLog(context, nodeId, 'log', args.join(' ')),
                error: (...args: any[]) => this.addLog(context, nodeId, 'error', args.join(' ')),
                warn: (...args: any[]) => this.addLog(context, nodeId, 'warn', args.join(' '))
            }
        }

        try {
            if (node.loopRole === 'start') {
                await this.handleLoopStart(node, input, workflow, context, options, startTime)
                return
            }
            if (node.loopRole === 'end') {
                await this.handleLoopEnd(node, input, context, options, startTime)
                return
            }
            if (node.loopRole === 'break') {
                await this.handleLoopBreak(node, input, context, options, startTime)
                return
            }

            let result: NodeExecutionResult
            if (node.type === 'merge' && String(node.params?.mode || 'ANY').toUpperCase() === 'ALL') {
                const expected = typeof node.expectedInputs === 'number' ? node.expectedInputs : 0
                const state = this.pendingMerge.get(nodeId) || { inputs: [], expected, executed: false, params: node.params }
                state.inputs.push(input)
                state.expected = expected
                this.pendingMerge.set(nodeId, state)

                if (!state.executed && (expected > 0 ? state.inputs.length >= expected : false)) {
                    state.executed = true
                    if (state.timer) {
                        try {
                            clearTimeout(state.timer)
                        } catch (_error) {
                            // ignore
                        }
                        state.timer = undefined
                    }
                    result = await this.nodeManager.executeNode(node.id, node.type, state.inputs, state.params, nodeContext)
                } else {
                    const timeout = Number(node.params?.timeout || 0)
                    const behavior = String(node.params?.timeoutBehavior || 'execute')
                    if (timeout > 0 && !state.timer) {
                        state.timer = setTimeout(async () => {
                            const cur = this.pendingMerge.get(nodeId)
                            if (!cur || cur.executed) return
                            cur.executed = true
                            try {
                                if (behavior === 'throw') {
                                    throw new Error(`合并节点等待超时: 已收到 ${cur.inputs.length}/${cur.expected}`)
                                }
                                const timeoutResult = await this.nodeManager.executeNode(node.id, node.type, cur.inputs, cur.params, nodeContext)
                                await this.afterNodeSuccess(nodeId, node, timeoutResult, workflow, context, options, startTime)
                            } catch (err) {
                                await options.callback?.onNodeError?.(nodeId, err as Error)
                            }
                        }, timeout)
                        this.pendingMerge.set(nodeId, state)
                    }
                    return
                }
            } else {
                result = await this.nodeManager.executeNode(node.id, node.type, input, node.params, nodeContext)
            }

            if (!result.success) {
                const err = new Error(`节点执行失败 > ${result.error}`)
                await options.callback?.onNodeError?.(nodeId, err)
                throw err
            }

            await this.afterNodeSuccess(nodeId, node, result, workflow, context, options, startTime)
        } catch (error) {
            const err = error as Error
            await options.callback?.onNodeError?.(nodeId, err)
            throw error
        }
    }

    private async executeNextNodes(
        node: ExecutionNode,
        result: NodeExecutionResult,
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions
    ): Promise<void> {
        if (node.branches) {
            await this.executeBranch(node, result, workflow, context, options)
        } else if (node.next.length > 0) {
            await Promise.all(
                node.next.map(nextId => this.executeNode(nextId, result.output, workflow, context, options))
            )
        }
    }

    private async afterNodeSuccess(
        nodeId: string,
        node: ExecutionNode,
        result: NodeExecutionResult,
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions,
        startTime: number
    ): Promise<void> {
        const elapsed = Date.now() - startTime
        const minDelay = options.minDelay || 0
        if (minDelay > elapsed) {
            await this.delay(minDelay - elapsed)
        }
        await options.callback?.onNodeComplete?.(nodeId, result)
        await this.executeNextNodes(node, result, workflow, context, options)
    }

    private async handleLoopStart(
        node: ExecutionNode,
        input: any,
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions,
        startTime: number
    ): Promise<void> {
        if (!node.loopPairId || !node.loopBodyEntry) {
            throw new Error(`循环开始节点配置不完整: ${node.id}`)
        }

        const endNode = workflow.nodes[node.loopPairId]
        if (!endNode) {
            throw new Error(`循环开始节点 ${node.id} 缺少结束节点 ${node.loopPairId}`)
        }

        const state: LoopRuntimeState = {
            startId: node.id,
            endId: endNode.id,
            bodyEntry: node.loopBodyEntry,
            exitNext: endNode.loopExitNext || null,
            originalInput: input,
            resultMode: String(node.params?.resultMode || 'collect') === 'last' ? 'last' : 'collect',
            items: this.buildLoopItems(node, input),
            results: [],
            broken: false,
            currentIteration: -1,
            iterationCompleted: false,
            iterationOutput: undefined,
            endArrivals: [],
            endExpected: Math.max(1, Number(endNode.expectedInputs || 1))
        }

        const elapsed = Date.now() - startTime
        const minDelay = options.minDelay || 0
        if (minDelay > elapsed) {
            await this.delay(minDelay - elapsed)
        }
        await options.callback?.onNodeComplete?.(node.id, { success: true, output: input })

        context.loopStack.push(state)
        try {
            for (let index = 0; index < state.items.length; index++) {
                state.currentIteration = index
                state.iterationCompleted = false
                state.iterationOutput = undefined
                state.endArrivals = []

                await this.executeNode(
                    state.bodyEntry,
                    this.buildLoopInput(state.originalInput, state.items[index]),
                    workflow,
                    context,
                    options
                )

                if (!state.iterationCompleted) {
                    throw new Error(`循环 ${node.id} 的第 ${index + 1} 轮未到达循环结束节点`)
                }

                state.results.push(state.iterationOutput)
                if (state.broken) break
            }
        } finally {
            context.loopStack.pop()
        }

        const finalOutput = this.buildLoopOutput(state)
        if (state.exitNext) {
            await this.executeNode(state.exitNext, finalOutput, workflow, context, options)
        }
    }

    private async handleLoopEnd(
        node: ExecutionNode,
        input: any,
        context: ExecutionContext,
        options: ExecutionOptions,
        startTime: number
    ): Promise<void> {
        const state = this.findLoopStateByEnd(context, node.id)
        if (!state) {
            throw new Error(`循环结束节点 ${node.id} 不在有效循环上下文中`)
        }

        state.endArrivals.push(input)
        if (!state.broken && state.endArrivals.length < state.endExpected) {
            return
        }

        state.iterationCompleted = true
        state.iterationOutput = state.endArrivals[state.endArrivals.length - 1]

        const elapsed = Date.now() - startTime
        const minDelay = options.minDelay || 0
        if (minDelay > elapsed) {
            await this.delay(minDelay - elapsed)
        }

        await options.callback?.onNodeComplete?.(node.id, {
            success: true,
            output: this.buildLoopOutput(state)
        })
    }

    private async handleLoopBreak(
        node: ExecutionNode,
        input: any,
        context: ExecutionContext,
        options: ExecutionOptions,
        startTime: number
    ): Promise<void> {
        const state = context.loopStack[context.loopStack.length - 1]
        if (!state) {
            throw new Error(`循环跳出节点 ${node.id} 不在循环体内`)
        }

        state.broken = true
        state.iterationCompleted = true
        state.iterationOutput = input
        state.endArrivals = [input]

        const elapsed = Date.now() - startTime
        const minDelay = options.minDelay || 0
        if (minDelay > elapsed) {
            await this.delay(minDelay - elapsed)
        }

        await options.callback?.onNodeComplete?.(node.id, {
            success: true,
            output: input
        })
    }

    private findLoopStateByEnd(context: ExecutionContext, endId: string): LoopRuntimeState | undefined {
        for (let i = context.loopStack.length - 1; i >= 0; i--) {
            const state = context.loopStack[i]
            if (state.endId === endId) return state
        }
        return undefined
    }

    private buildLoopItems(node: ExecutionNode, input: any): LoopRuntimeItem[] {
        const mode = String(node.params?.mode || 'count')
        if (mode === 'iterate') {
            const source = this.resolveSource(node.params?.source, input)
            if (Array.isArray(source)) {
                return source.map((item, index) => ({
                    mode: 'iterate',
                    index,
                    iteration: index + 1,
                    count: source.length,
                    isFirst: index === 0,
                    isLast: index === source.length - 1,
                    item
                }))
            }
            if (source && typeof source === 'object') {
                const entries = Object.entries(source)
                return entries.map(([key, value], index) => ({
                    mode: 'iterate',
                    index,
                    iteration: index + 1,
                    count: entries.length,
                    isFirst: index === 0,
                    isLast: index === entries.length - 1,
                    item: value,
                    key,
                    value
                }))
            }
            return []
        }

        const count = Math.max(0, Number(node.params?.count || 0))
        return Array.from({ length: count }, (_, index) => ({
            mode: 'count',
            index,
            iteration: index + 1,
            count,
            isFirst: index === 0,
            isLast: index === count - 1,
            item: index
        }))
    }

    private resolveSource(source: any, input: any): any {
        if (source === undefined || source === null) return undefined
        if (typeof source !== 'string') return source

        const normalized = source.trim().replace(/\[(\d+)\]/g, '.$1')
        if (!normalized) return undefined

        let current: any = input
        for (const part of normalized.split('.')) {
            if (part === 'input') continue
            if (current === undefined || current === null) return undefined
            current = current[part]
        }
        return current
    }

    private buildLoopInput(originalInput: any, item: LoopRuntimeItem): any {
        const loop = {
            mode: item.mode,
            index: item.index,
            iteration: item.iteration,
            count: item.count,
            isFirst: item.isFirst,
            isLast: item.isLast,
            item: item.item,
            ...(item.key !== undefined ? { key: item.key } : {}),
            ...(item.value !== undefined ? { value: item.value } : {})
        }

        if (originalInput && typeof originalInput === 'object' && !Array.isArray(originalInput)) {
            return { ...originalInput, loop }
        }

        return { input: originalInput, loop }
    }

    private buildLoopOutput(state: LoopRuntimeState): any {
        const lastResult = state.results.length > 0
            ? state.results[state.results.length - 1]
            : state.iterationOutput

        return {
            results: state.resultMode === 'collect' ? state.results : [],
            result: lastResult,
            loopSummary: {
                mode: state.items[0]?.mode || 'count',
                completed: state.results.length,
                total: state.items.length,
                broken: state.broken
            }
        }
    }

    private async executeBranch(
        node: ExecutionNode,
        result: NodeExecutionResult,
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions
    ): Promise<void> {
        if (!node.branches) return

        if (node.type === 'ifelse') {
            const condition = result.output._branch
            const branchKey = condition ? 'true' : 'false'
            const nextNodeId = node.branches[branchKey]

            if (nextNodeId) {
                await this.executeNode(nextNodeId, result.output, workflow, context, options)
            } else if (node.branches.default) {
                await this.executeNode(node.branches.default, result.output, workflow, context, options)
            }
        } else {
            const branchKey = (result.output && result.output._branchKey !== undefined)
                ? String(result.output._branchKey)
                : String(result.output)
            const nextNodeId = node.branches[branchKey] || node.branches.default

            if (nextNodeId) {
                await this.executeNode(nextNodeId, result.output, workflow, context, options)
            } else if (node.next && node.next.length > 0) {
                await Promise.all(
                    node.next.map(nextId => this.executeNode(nextId, result.output, workflow, context, options))
                )
            }
        }
    }

    private addLog(
        context: ExecutionContext,
        nodeId: string,
        level: 'log' | 'error' | 'warn',
        message: string,
        data?: any
    ): void {
        context.logs.push({
            timestamp: Date.now(),
            nodeId,
            level,
            message,
            data
        })
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
