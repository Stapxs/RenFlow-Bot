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

    convertAuto(workflow: VueFlowWorkflow | WorkflowExecution): WorkflowExecution {
        if (this.isExecutionWorkflow(workflow)) {
            return workflow
        }
        return this.convert(workflow)
    }

    convert(vueFlowWorkflow: VueFlowWorkflow): WorkflowExecution {
        let trigger = this.extractTrigger(vueFlowWorkflow)

        const triggerNode = vueFlowWorkflow.nodes.find(
            node => node.type === 'trigger' || node.id === 'node-trigger'
        )

        if (!triggerNode) {
            throw new Error('未找到触发器节点')
        }

        if (triggerNode.data) {
            const triggerParams = triggerNode.data || {}
            delete triggerParams.metadata
            trigger = {
                ...trigger,
                params: triggerParams
            }
        }

        const entryNode = this.findEntryNode(triggerNode.id, vueFlowWorkflow.edges)
        const nodes = this.buildNodeMap(vueFlowWorkflow.nodes, vueFlowWorkflow.edges)

        return {
            id: vueFlowWorkflow.id,
            name: vueFlowWorkflow.name,
            description: vueFlowWorkflow.description,
            trigger,
            entryNode,
            nodes,
            createdAt: vueFlowWorkflow.createdAt,
            updatedAt: vueFlowWorkflow.updatedAt
        }
    }

    private extractTrigger(workflow: VueFlowWorkflow): TriggerConfig {
        return {
            type: workflow.triggerType,
            typeLabel: workflow.triggerTypeLabel,
            name: workflow.triggerName,
            label: workflow.triggerLabel,
            params: { ...(workflow.startParams || {}) }
        }
    }

    private isExecutionWorkflow(workflow: VueFlowWorkflow | WorkflowExecution): workflow is WorkflowExecution {
        if (!workflow || typeof workflow !== 'object') {
            return false
        }

        const candidate = workflow as WorkflowExecution
        return !!candidate.trigger
            && typeof candidate.trigger === 'object'
            && !Array.isArray(candidate.nodes)
            && !!candidate.nodes
            && typeof candidate.nodes === 'object'
    }

    private findEntryNode(triggerNodeId: string, edges: VueFlowEdge[]): string | null {
        const edge = edges.find(e => e.source === triggerNodeId && e.data?.kind !== 'loop-pair')
        return edge ? edge.target : null
    }

    private buildNodeMap(
        nodes: VueFlowNode[],
        edges: VueFlowEdge[]
    ): Record<string, ExecutionNode> {
        const nodeMap: Record<string, ExecutionNode> = {}
        const incomingCount: Record<string, number> = {}
        const pairEdges = edges.filter(edge => edge.data?.kind === 'loop-pair')
        const normalEdges = edges.filter(edge => edge.data?.kind !== 'loop-pair')

        for (const e of normalEdges) {
            incomingCount[e.target] = (incomingCount[e.target] || 0) + 1
        }

        const executionNodes = nodes.filter(
            node => node.type !== 'trigger' && node.id !== 'node-trigger'
        )

        for (const node of executionNodes) {
            const executionNode = this.convertNode(node, normalEdges, pairEdges)
            executionNode.expectedInputs = incomingCount[node.id] || 0
            nodeMap[node.id] = executionNode
        }

        return nodeMap
    }

    private convertNode(node: VueFlowNode, edges: VueFlowEdge[], pairEdges: VueFlowEdge[]): ExecutionNode {
        const nodeType = node.data.nodeType
        const params = node.data.params || {}
        const outgoingEdges = edges.filter(e => e.source === node.id)

        const executionNode: ExecutionNode = {
            id: node.id,
            type: nodeType!,
            params,
            next: []
        }

        if (nodeType === 'loop-start') executionNode.loopRole = 'start'
        if (nodeType === 'loop-end') executionNode.loopRole = 'end'
        if (nodeType === 'loop-break') executionNode.loopRole = 'break'

        const pairEdge = pairEdges.find(edge => edge.source === node.id || edge.target === node.id)
        if (pairEdge) {
            executionNode.loopPairId = pairEdge.source === node.id ? pairEdge.target : pairEdge.source
        }

        if (this.isConditionalNode(node)) {
            const { branches, regularEdges } = this.buildBranches(outgoingEdges)
            executionNode.branches = branches
            executionNode.next = regularEdges.map(e => e.target)
        } else {
            executionNode.next = outgoingEdges.map(e => e.target)
        }

        if (executionNode.loopRole === 'start') {
            executionNode.loopBodyEntry = executionNode.next[0] || null
        }
        if (executionNode.loopRole === 'end') {
            executionNode.loopExitNext = executionNode.next[0] || null
        }

        return executionNode
    }

    private isConditionalNode(node: VueFlowNode): boolean {
        const nodeType = node.data.nodeType
        return nodeType === 'ifelse' || nodeType === 'switch'
    }

    private buildBranches(edges: VueFlowEdge[]): {
        branches: ExecutionNode['branches']
        regularEdges: VueFlowEdge[]
    } {
        const branches: ExecutionNode['branches'] = {}
        const regularEdges: VueFlowEdge[] = []

        for (const edge of edges) {
            const hasBranchIndicator = edge.sourceHandle || edge.data?.condition
            if (hasBranchIndicator) {
                branches[this.getBranchType(edge)] = edge.target
            } else if (branches.default === undefined) {
                branches.default = edge.target
            } else {
                regularEdges.push(edge)
            }
        }

        return { branches, regularEdges }
    }

    private getBranchType(edge: VueFlowEdge): string {
        if (edge.sourceHandle) {
            const match = edge.sourceHandle.match(/source-(.+)/)
            if (match) return match[1]
            return edge.sourceHandle
        }

        if (edge.data?.condition) {
            return edge.data.condition
        }

        return 'default'
    }

    validate(execution: WorkflowExecution): { valid: boolean; errors: string[]; warnings: string[] } {
        const errors: string[] = []
        const warnings: string[] = []
        const nodes = execution.nodes

        if (!execution.entryNode) {
            errors.push('工作流没有入口节点（触发器未连接到任何节点）')
        } else if (!nodes[execution.entryNode]) {
            errors.push(`入口节点 ${execution.entryNode} 不存在`)
        }

        for (const [nodeId, node] of Object.entries(nodes)) {
            for (const nextId of node.next || []) {
                if (nextId && !nodes[nextId]) {
                    errors.push(`节点 ${nodeId} 引用了不存在的节点: ${nextId}`)
                }
            }

            if (node.branches) {
                for (const [branchName, targetId] of Object.entries(node.branches)) {
                    if (targetId && !nodes[targetId]) {
                        errors.push(`节点 ${nodeId} 的分支 ${branchName} 引用了不存在的节点: ${targetId}`)
                    }
                }
            }
        }

        const referencedNodes = new Set<string>()
        if (execution.entryNode) referencedNodes.add(execution.entryNode)

        for (const node of Object.values(nodes)) {
            for (const nextId of node.next || []) {
                if (nextId && typeof nextId === 'string' && nextId.trim()) {
                    referencedNodes.add(nextId)
                }
            }
            for (const targetId of Object.values(node.branches || {})) {
                if (targetId && typeof targetId === 'string' && targetId.trim()) {
                    referencedNodes.add(targetId)
                }
            }
        }

        for (const nodeId of Object.keys(nodes)) {
            if (!referencedNodes.has(nodeId)) {
                warnings.push(`节点 ${nodeId} 是孤立节点（未被任何节点引用）`)
            }
        }

        const adjacency = this.buildAdjacency(nodes)
        const loopStarts = Object.values(nodes).filter(node => node.loopRole === 'start')
        const loopEnds = Object.values(nodes).filter(node => node.loopRole === 'end')
        const loopBreaks = Object.values(nodes).filter(node => node.loopRole === 'break')
        const loopBodies = new Map<string, Set<string>>()

        for (const start of loopStarts) {
            if (!start.loopPairId) {
                errors.push(`循环开始节点 ${start.id} 缺少配对的循环结束节点`)
                continue
            }

            const end = nodes[start.loopPairId]
            if (!end || end.loopRole !== 'end') {
                errors.push(`循环开始节点 ${start.id} 的配对节点无效: ${start.loopPairId}`)
                continue
            }

            if (end.loopPairId !== start.id) {
                errors.push(`循环节点 ${start.id} 与 ${end.id} 的配对关系不一致`)
            }
            if (start.next.length !== 1) {
                errors.push(`循环开始节点 ${start.id} 必须且只能有 1 条普通输出边`)
            }
            if (end.next.length > 1) {
                errors.push(`循环结束节点 ${end.id} 最多只能有 1 条普通输出边`)
            }
            if (start.next.includes(end.id)) {
                errors.push(`循环开始节点 ${start.id} 不允许普通直连循环结束节点 ${end.id}`)
            }
            if (!start.loopBodyEntry) {
                errors.push(`循环开始节点 ${start.id} 缺少循环体入口`)
                continue
            }

            const bodyNodes = this.collectLoopBodyNodes(start.loopBodyEntry, start.id, end.id, adjacency)
            loopBodies.set(start.id, bodyNodes)

            const bodyContent = Array.from(bodyNodes).filter(nodeId => {
                const node = nodes[nodeId]
                return node && node.id !== end.id && node.loopRole !== 'break'
            })

            if (bodyContent.length === 0) {
                errors.push(`循环 ${start.id} 到 ${end.id} 的循环体不能为空`)
            }
            if (!bodyNodes.has(end.id)) {
                errors.push(`循环 ${start.id} 的循环体入口无法到达结束节点 ${end.id}`)
            }

            for (const nodeId of bodyNodes) {
                if (nodeId === end.id) continue
                if (!this.allPathsResolveToLoopEnd(nodeId, start.id, end.id, nodes, adjacency, new Set())) {
                    errors.push(`循环 ${start.id} 的节点 ${nodeId} 存在无法收敛到 ${end.id} 的路径`)
                    break
                }
            }

            const mode = String(start.params?.mode || 'count')
            if (mode === 'count') {
                const count = Number(start.params?.count)
                if (!Number.isFinite(count) || count < 0) {
                    errors.push(`循环开始节点 ${start.id} 的 count 必须是大于等于 0 的数值`)
                }
            } else if (mode === 'iterate') {
                if (String(start.params?.source || '').trim() === '') {
                    errors.push(`循环开始节点 ${start.id} 的遍历来源不能为空`)
                }
            } else {
                errors.push(`循环开始节点 ${start.id} 使用了未知的循环模式: ${mode}`)
            }
        }

        for (const end of loopEnds) {
            if (!end.loopPairId) {
                errors.push(`循环结束节点 ${end.id} 缺少配对的循环开始节点`)
                continue
            }
            const start = nodes[end.loopPairId]
            if (!start || start.loopRole !== 'start') {
                errors.push(`循环结束节点 ${end.id} 的配对节点无效: ${end.loopPairId}`)
            }
        }

        for (const breakNode of loopBreaks) {
            if ((breakNode.next || []).length > 0) {
                errors.push(`循环跳出节点 ${breakNode.id} 不允许有普通输出边`)
            }
            const owners = loopStarts.filter(start => loopBodies.get(start.id)?.has(breakNode.id))
            if (owners.length === 0) {
                errors.push(`循环跳出节点 ${breakNode.id} 不能位于循环外`)
            }
        }

        for (let i = 0; i < loopStarts.length; i++) {
            for (let j = i + 1; j < loopStarts.length; j++) {
                const a = loopStarts[i]
                const b = loopStarts[j]
                const aBody = loopBodies.get(a.id) || new Set<string>()
                const bBody = loopBodies.get(b.id) || new Set<string>()
                const aContainsBStart = aBody.has(b.id)
                const aContainsBEnd = b.loopPairId ? aBody.has(b.loopPairId) : false
                const bContainsAStart = bBody.has(a.id)
                const bContainsAEnd = a.loopPairId ? bBody.has(a.loopPairId) : false
                if (aContainsBStart !== aContainsBEnd || bContainsAStart !== bContainsAEnd) {
                    errors.push(`循环 ${a.id} 与 ${b.id} 的配对结构交叉`)
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        }
    }

    private buildAdjacency(nodes: Record<string, ExecutionNode>): Map<string, string[]> {
        const adjacency = new Map<string, string[]>()
        for (const node of Object.values(nodes)) {
            const next = new Set<string>()
            for (const nextId of node.next || []) {
                if (nextId) next.add(nextId)
            }
            for (const branchTarget of Object.values(node.branches || {})) {
                if (branchTarget) next.add(branchTarget)
            }
            adjacency.set(node.id, Array.from(next))
        }
        return adjacency
    }

    private collectLoopBodyNodes(
        entryId: string,
        loopStartId: string,
        loopEndId: string,
        adjacency: Map<string, string[]>
    ): Set<string> {
        const visited = new Set<string>()
        const stack = [entryId]

        while (stack.length > 0) {
            const currentId = stack.pop()!
            if (visited.has(currentId)) continue
            visited.add(currentId)
            if (currentId === loopEndId) continue

            for (const nextId of adjacency.get(currentId) || []) {
                if (nextId === loopStartId) continue
                stack.push(nextId)
            }
        }

        return visited
    }

    private allPathsResolveToLoopEnd(
        nodeId: string,
        loopStartId: string,
        loopEndId: string,
        nodes: Record<string, ExecutionNode>,
        adjacency: Map<string, string[]>,
        visiting: Set<string>
    ): boolean {
        if (nodeId === loopEndId) return true
        if (visiting.has(nodeId)) return true

        const node = nodes[nodeId]
        if (!node) return false
        if (node.loopRole === 'break') return true

        const nextIds = (adjacency.get(nodeId) || []).filter(nextId => nextId !== loopStartId)
        if (nextIds.length === 0) return false

        visiting.add(nodeId)
        for (const nextId of nextIds) {
            if (!this.allPathsResolveToLoopEnd(nextId, loopStartId, loopEndId, nodes, adjacency, visiting)) {
                visiting.delete(nodeId)
                return false
            }
        }
        visiting.delete(nodeId)
        return true
    }
}
