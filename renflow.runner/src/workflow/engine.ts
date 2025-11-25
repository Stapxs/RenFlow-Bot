/**
 * 工作流执行引擎
 * 负责执行转换后的工作流
 */

import type { WorkflowExecution, ExecutionNode } from './types.js'
import type { NodeContext, NodeExecutionResult } from '../nodes/types.js'
import { NodeManager } from '../nodes/NodeManager.js'
import { Logger } from '../utils/logger.js'

/**
 * 执行上下文
 */
export interface ExecutionContext {
    /** 工作流 ID */
    workflowId: string
    /** 全局状态 */
    globalState: Map<string, any>
    /** 触发数据（来自触发器的输入） */
    triggerData: any
    /** 执行日志 */
    logs: ExecutionLog[]
}

/**
 * 执行日志
 */
export interface ExecutionLog {
    /** 时间戳 */
    timestamp: number
    /** 节点 ID */
    nodeId: string
    /** 日志级别 */
    level: 'log' | 'error' | 'warn'
    /** 日志消息 */
    message: string
    /** 额外数据 */
    data?: any
}

/**
 * 执行结果
 */
export interface WorkflowExecutionResult {
    /** 是否执行成功 */
    success: boolean
    /** 错误信息 */
    error?: string
    /** 执行日志 */
    logs: ExecutionLog[]
    /** 最终状态 */
    finalState: Map<string, any>
}

/**
 * 执行状态回调
 */
export interface ExecutionCallback {
    /** 节点开始执行 */
    onNodeStart?: (nodeId: string, nodeType: string) => void | Promise<void>
    /** 节点执行完成 */
    onNodeComplete?: (nodeId: string, result: NodeExecutionResult) => void | Promise<void>
    /** 节点执行失败 */
    onNodeError?: (nodeId: string, error: Error) => void | Promise<void>
    /** 工作流执行完成 */
    onWorkflowComplete?: (result: WorkflowExecutionResult) => void | Promise<void>
}

/**
 * 执行选项
 */
export interface ExecutionOptions {
    /** 每个节点的最小执行延迟（毫秒），用于可视化 */
    minDelay?: number
    /** 执行超时时间（毫秒） */
    timeout?: number
    /** 状态回调 */
    callback?: ExecutionCallback
    /** 初始全局变量（会被复制到 ExecutionContext.globalState），可在此传入 bot 等对象 */
    initialGlobals?: Record<string, any>
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

    /**
     * 执行工作流
     * @param workflow 工作流执行数据
     * @param triggerData 触发数据
     * @param options 执行选项
     * @returns 执行结果
     */
    async execute(
        workflow: WorkflowExecution,
        triggerData: any = null,
        options: ExecutionOptions = {}
    ): Promise<WorkflowExecutionResult> {
        this.logger.info(`开始执行工作流: ${workflow.name} (${workflow.id})`)

        // 创建执行上下文
        const context: ExecutionContext = {
            workflowId: workflow.id,
            globalState: new Map(),
            triggerData,
            logs: []
        }

        // 如果有初始全局变量，注入到 globalState
        if (options.initialGlobals) {
            for (const [k, v] of Object.entries(options.initialGlobals)) {
                context.globalState.set(k, v)
            }
        }

        // 请通过 options.initialGlobals 传入 bot 或其他初始全局对象，例如: { initialGlobals: { bot: myBot } }
        // 如果执行时包含触发数据，把触发数据写入全局存储，键名为 'trigger'
        if (context.triggerData !== undefined && context.triggerData !== null) {
            context.globalState.set('trigger', context.triggerData)
        }

        const executePromise = this.executeInternal(workflow, context, options)

        // 如果设置了超时，使用 Promise.race
        if (options.timeout && options.timeout > 0) {
            const timeoutPromise = new Promise<WorkflowExecutionResult>((_, reject) => {
                setTimeout(() => reject(new Error(`执行超时 (${options.timeout}ms)`)), options.timeout)
            })

            try {
                return await Promise.race([executePromise, timeoutPromise])
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                this.logger.error(`工作流执行失败 > ${errorMessage}`)

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

    /**
     * 内部执行方法
     */
    private async executeInternal(
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions
    ): Promise<WorkflowExecutionResult> {
        try {
            // 检查入口节点
            if (!workflow.entryNode) {
                throw new Error('工作流没有入口节点')
            }

            // 从入口节点开始执行
            await this.executeNode(
                workflow.entryNode,
                context.triggerData,
                workflow,
                context,
                options
            )

            this.logger.info(`工作流执行完成: ${workflow.name}`)

            const result: WorkflowExecutionResult = {
                success: true,
                logs: context.logs,
                finalState: context.globalState
            }

            await options.callback?.onWorkflowComplete?.(result)
            return result
        } catch (error) {
            this.logger.error(`工作流执行失败 > ${error as unknown as Error}`)

            const result: WorkflowExecutionResult = {
                success: false,
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

    /**
     * 执行单个节点
     */
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

        this.logger.info(`执行节点: ${nodeId} (${node.type})`)

        // 触发节点开始回调
        await options.callback?.onNodeStart?.(nodeId, node.type)

        // 创建节点上下文
        const nodeContext: NodeContext = {
            nodeId: node.id,
            nodeType: node.type,
            globalState: context.globalState,
            logger: {
                log: (...args: any[]) => {
                    this.addLog(context, nodeId, 'log', args.join(' '))
                },
                error: (...args: any[]) => {
                    this.addLog(context, nodeId, 'error', args.join(' '))
                },
                warn: (...args: any[]) => {
                    this.addLog(context, nodeId, 'warn', args.join(' '))
                }
            }
        }

        let result: NodeExecutionResult

        try {
            if (node.type === 'merge' && String(node.params?.mode || 'ANY').toUpperCase() === 'ALL') {
                const expected = typeof node.expectedInputs === 'number' ? node.expectedInputs : 0
                const state = this.pendingMerge.get(nodeId) || { inputs: [], expected, executed: false, params: node.params }
                state.inputs.push(input)
                state.expected = expected
                this.pendingMerge.set(nodeId, state)

                if (!state.executed && (expected > 0 ? state.inputs.length >= expected : false)) {
                    state.executed = true
                    if (state.timer) { try { clearTimeout(state.timer) } catch {} state.timer = undefined }
                    result = await this.nodeManager.executeNode(
                        node.id,
                        node.type,
                        state.inputs,
                        state.params,
                        nodeContext
                    )
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
                                result = await this.nodeManager.executeNode(
                                    node.id,
                                    node.type,
                                    cur.inputs,
                                    cur.params,
                                    nodeContext
                                )
                                await this.afterNodeSuccess(nodeId, node, result, workflow, context, options, startTime)
                            } catch (err) {
                                await options.callback?.onNodeError?.(nodeId, err as Error)
                            }
                        }, timeout)
                        this.pendingMerge.set(nodeId, state)
                    }
                    return
                }
            } else {
                result = await this.nodeManager.executeNode(
                    node.id,
                    node.type,
                    input,
                    node.params,
                    nodeContext
                )
            }
        } catch (error) {
            // 触发节点错误回调
            const err = error as unknown as Error
            await options.callback?.onNodeError?.(nodeId, err)
            throw error
        }

        // 记录执行结果
        if (!result.success) {
            // 触发节点错误回调
            const err = new Error(`节点执行失败 > ${result.error}`)
            await options.callback?.onNodeError?.(nodeId, err)
            throw err
        }

        await this.afterNodeSuccess(nodeId, node, result, workflow, context, options, startTime)
    }

    /**
     * 执行下一个节点
     */
    private async executeNextNodes(
        node: ExecutionNode,
        result: NodeExecutionResult,
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions
    ): Promise<void> {
        // 如果是条件节点，根据结果选择分支
        if (node.branches) {
            await this.executeBranch(node, result, workflow, context, options)
        } else if (node.next.length > 0) {
            // 普通节点：并行执行所有下一个节点（非列队）
            // 使用 Promise.all 保证并行执行并在任一子任务抛出错误时向上抛出
            const executions = node.next.map(nextId =>
                this.executeNode(nextId, result.output, workflow, context, options)
            )

            await Promise.all(executions)
        }
        // 如果 next 为空，说明到达流程终点
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
        this.logger.info(`节点执行成功: ${nodeId}`)
        await options.callback?.onNodeComplete?.(nodeId, result)
        await this.executeNextNodes(node, result, workflow, context, options)
    }

    /**
     * 执行条件分支
     */
    private async executeBranch(
        node: ExecutionNode,
        result: NodeExecutionResult,
        workflow: WorkflowExecution,
        context: ExecutionContext,
        options: ExecutionOptions
    ): Promise<void> {
        if (!node.branches) return

        // 根据节点类型处理分支
        if (node.type === 'ifelse') {
            // ifelse 节点：根据输出的布尔值选择分支
            const condition = result.output._branch
            const branchKey = condition ? 'true' : 'false'
            const nextNodeId = node.branches[branchKey]

            if (nextNodeId) {
                await this.executeNode(nextNodeId, result.output, workflow, context, options)
            } else {
                const defaultNext = node.branches['default']
                if (defaultNext) {
                    await this.executeNode(defaultNext, result.output, workflow, context, options)
                } else {
                    this.logger.info(`分支 ${branchKey} 没有连接节点，流程结束`)
                }
            }
        } else {
            // 其他条件节点：使用 output 作为分支键
            const branchKey = (result.output && result.output._branchKey !== undefined)
                ? String(result.output._branchKey)
                : String(result.output)
            const nextNodeId = node.branches[branchKey] || node.branches['default']

            if (nextNodeId) {
                await this.executeNode(nextNodeId, result.output, workflow, context, options)
            } else {
                if (node.next && node.next.length > 0) {
                    const executions = node.next.map(nextId =>
                        this.executeNode(nextId, result.output, workflow, context, options)
                    )
                    await Promise.all(executions)
                } else {
                    this.logger.info(`没有匹配的分支: ${branchKey}，流程结束`)
                }
            }
        }
    }

    /**
     * 添加执行日志
     */
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

    /**
     * 延迟函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
