/**
 * 工作流转换器
 * 将 Vue Flow 的图形数据转换为简洁的执行数据结构
 */

import type {
    VueFlowWorkflow,
    VueFlowNode,
    VueFlowEdge,
    WorkflowExecution,
    ExecutionNode,
    TriggerConfig
} from './types.js'
import { Logger } from '../utils/logger.js'

export class WorkflowConverter {
    private logger: Logger

    constructor() {
        this.logger = new Logger('WorkflowConverter')
    }

    /**
     * 将 Vue Flow 工作流转换为执行数据
     * @param vueFlowWorkflow Vue Flow 工作流数据
     * @returns 执行数据
     */
    convert(vueFlowWorkflow: VueFlowWorkflow): WorkflowExecution {
        // 1. 提取触发器配置
    let trigger = this.extractTrigger(vueFlowWorkflow)

        // 2. 找到触发器节点
        const triggerNode = vueFlowWorkflow.nodes.find(
            node => node.type === 'trigger' || node.id === 'node-trigger'
        )

        if (!triggerNode) {
            throw new Error('未找到触发器节点')
        }

        // 如果触发器节点包含额外参数（例如过滤设置、开关等），把它们合并到 trigger.params 中
        // 这样在执行时可以通过 workflow.trigger.params 访问这些设置
        if (triggerNode.data) {
            const triggerParams = triggerNode.data || {}
            delete triggerParams.metadata
            trigger = {
                ...trigger,
                params: triggerParams
            }
        }

        // 3. 找到触发器的下一个节点（入口节点）
        const entryNode = this.findEntryNode(triggerNode.id, vueFlowWorkflow.edges)

        // 4. 构建节点映射表
        const nodes = this.buildNodeMap(vueFlowWorkflow.nodes, vueFlowWorkflow.edges)

        // 5. 构建执行数据
        const execution: WorkflowExecution = {
            id: vueFlowWorkflow.id,
            name: vueFlowWorkflow.name,
            description: vueFlowWorkflow.description,
            trigger,
            entryNode,
            nodes,
            createdAt: vueFlowWorkflow.createdAt,
            updatedAt: vueFlowWorkflow.updatedAt
        }

        return execution
    }

    /**
     * 提取触发器配置
     */
    private extractTrigger(workflow: VueFlowWorkflow): TriggerConfig {
        return {
            type: workflow.triggerType,
            typeLabel: workflow.triggerTypeLabel,
            name: workflow.triggerName,
            label: workflow.triggerLabel
        }
    }

    /**
     * 找到入口节点（触发器后的第一个节点）
     */
    private findEntryNode(triggerNodeId: string, edges: VueFlowEdge[]): string | null {
        const edge = edges.find(e => e.source === triggerNodeId)
        return edge ? edge.target : null
    }

    /**
     * 构建节点映射表
     */
    private buildNodeMap(
        nodes: VueFlowNode[],
        edges: VueFlowEdge[]
    ): Record<string, ExecutionNode> {
        const nodeMap: Record<string, ExecutionNode> = {}
        const incomingCount: Record<string, number> = {}
        for (const e of edges) {
            incomingCount[e.target] = (incomingCount[e.target] || 0) + 1
        }

        // 过滤掉触发器节点
        const executionNodes = nodes.filter(
            node => node.type !== 'trigger' && node.id !== 'node-trigger'
        )

        for (const node of executionNodes) {
            const executionNode = this.convertNode(node, edges)
            executionNode.expectedInputs = incomingCount[node.id] || 0
            nodeMap[node.id] = executionNode
        }

        return nodeMap
    }

    /**
     * 转换单个节点
     */
    private convertNode(node: VueFlowNode, edges: VueFlowEdge[]): ExecutionNode {
        // 获取节点类型
        const nodeType = node.data.nodeType

        // 获取节点参数
        const params = node.data.params || {}

        // 查找该节点的所有出边
        const outgoingEdges = edges.filter(e => e.source === node.id)

        // 构建基础执行节点
        const executionNode: ExecutionNode = {
            id: node.id,
            type: nodeType!,
            params,
            next: []
        }

        // 处理不同类型的节点
        if (this.isConditionalNode(node)) {
            // 条件节点
            const { branches, regularEdges } = this.buildBranches(outgoingEdges)

            this.logger.debug(
                `条件节点 ${node.id}: outgoingEdges=${outgoingEdges.length}, ` +
                `branches=${Object.keys(branches || {}).length}, regularEdges=${regularEdges.length}`
            )

            executionNode.branches = branches
            // 将不属于分支的边放入 next
            executionNode.next = regularEdges.map(e => e.target)
        } else {
            // 普通节点：直接连接到下一个节点
            executionNode.next = outgoingEdges.map(e => e.target)
        }

        return executionNode
    }

    /**
     * 判断是否为条件节点
     */
    private isConditionalNode(node: VueFlowNode): boolean {
        const nodeType = node.data.nodeType
        return nodeType === 'ifelse' || nodeType === 'switch'
    }

    /**
     * 构建条件分支
     * @returns 分支映射和普通边的数组
     */
    private buildBranches(edges: VueFlowEdge[]): {
        branches: ExecutionNode['branches']
        regularEdges: VueFlowEdge[]
    } {
        const branches: ExecutionNode['branches'] = {}
        const regularEdges: VueFlowEdge[] = []

        for (const edge of edges) {
            // 检查边是否有分支标识（sourceHandle 或 condition）
            const hasBranchIndicator = edge.sourceHandle || edge.data?.condition

            this.logger.debug(
                `边 ${edge.id}: source=${edge.source}, target=${edge.target}, ` +
                `sourceHandle=${edge.sourceHandle || 'undefined'}, ` +
                `condition=${edge.data?.condition || 'undefined'}`
            )

            if (hasBranchIndicator) {
                // 这是一个分支边，加入 branches
                const branchType = this.getBranchType(edge)
                branches[branchType] = edge.target
                this.logger.debug(`  -> 归类为分支边，类型: ${branchType}, target: ${edge.target}`)
            } else {
                // 条件节点上的无标识边视为默认分支
                if (branches['default'] === undefined) {
                    branches['default'] = edge.target
                    this.logger.debug(`  -> 归类为分支边，类型: default, target: ${edge.target}`)
                } else {
                    // 多个无标识边，仍作为普通边进入 next
                    regularEdges.push(edge)
                    this.logger.debug('  -> 归类为普通边')
                }
            }
        }

        return { branches, regularEdges }
    }

    /**
     * 获取分支类型
     */
    private getBranchType(edge: VueFlowEdge): string {
        // 1. 优先使用 sourceHandle（Vue Flow 中的句柄 ID）
        if (edge.sourceHandle) {
            // 尝试提取句柄中的分支标识，如 "source-true" -> "true"
            const match = edge.sourceHandle.match(/source-(.+)/)
            if (match) {
                return match[1]
            }
            // 如果没有 "source-" 前缀，直接使用 sourceHandle 的值
            // 例如：Handle id="true" 可能直接产生 sourceHandle="true"
            return edge.sourceHandle
        }

        // 2. 使用 edge.data.condition
        if (edge.data?.condition) {
            return edge.data.condition
        }

        // 3. 默认为 "default"
        return 'default'
    }

    /**
     * 验证执行数据的完整性
     */
    validate(execution: WorkflowExecution): { valid: boolean; errors: string[] } {
        const errors: string[] = []

        // 1. 检查是否有入口节点
        if (!execution.entryNode) {
            errors.push('工作流没有入口节点（触发器未连接到任何节点）')
        } else if (!execution.nodes[execution.entryNode]) {
            errors.push(`入口节点 ${execution.entryNode} 不存在`)
        }

        // 2. 检查节点引用的完整性
        for (const [nodeId, node] of Object.entries(execution.nodes)) {
            // 检查 next 中的节点
            if (node.next && Array.isArray(node.next)) {
                for (const nextId of node.next) {
                    if (nextId && !execution.nodes[nextId]) {
                        errors.push(`节点 ${nodeId} 引用了不存在的节点: ${nextId}`)
                    }
                }
            }

            // 检查 branches 中的节点
            if (node.branches) {
                for (const [branchName, targetId] of Object.entries(node.branches)) {
                    if (targetId && !execution.nodes[targetId]) {
                        errors.push(
                            `节点 ${nodeId} 的分支 ${branchName} 引用了不存在的节点: ${targetId}`
                        )
                    }
                }
            }
        }

        // 3. 检查是否存在孤立节点(没有被任何节点引用,也不是入口节点)
        const referencedNodes = new Set<string>()
        if (execution.entryNode) {
            referencedNodes.add(execution.entryNode)
        }

        for (const node of Object.values(execution.nodes)) {
            // 检查 next 数组中的节点
            if (node.next && Array.isArray(node.next)) {
                for (const nextId of node.next) {
                    if (nextId && typeof nextId === 'string' && nextId.trim()) {
                        referencedNodes.add(nextId)
                    }
                }
            }

            // 检查 branches 对象中的节点
            if (node.branches && typeof node.branches === 'object') {
                for (const targetId of Object.values(node.branches)) {
                    if (targetId && typeof targetId === 'string' && targetId.trim()) {
                        referencedNodes.add(targetId)
                    }
                }
            }
        }

        for (const nodeId of Object.keys(execution.nodes)) {
            if (!referencedNodes.has(nodeId)) {
                const node = execution.nodes[nodeId]
                this.logger.debug(
                    `孤立节点检测: ${nodeId} (类型: ${node.type}), ` +
                    `next: [${node.next.join(', ')}], ` +
                    `branches: ${node.branches ? JSON.stringify(node.branches) : 'null'}`
                )
                errors.push(`节点 ${nodeId} 是孤立节点（未被任何节点引用）`)
            }
        }        return {
            valid: errors.length === 0,
            errors
        }
    }
}
