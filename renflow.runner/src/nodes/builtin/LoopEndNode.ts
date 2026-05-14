import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

export class LoopEndNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'loop-end',
        name: '循环结束',
        description: '循环结构的结束节点，由循环开始节点自动创建',
        category: 'control',
        icon: 'flag-checkered',
        hidden: true,
        maxOutput: 1,
        params: [],
        outputSchema: [
            { key: 'results', label: '循环结果列表', type: 'array' },
            { key: 'result', label: '最后结果', type: 'any' },
            { key: 'loopSummary', label: '循环摘要', type: 'object' }
        ]
    }

    async execute(
        input: any,
        _params: Record<string, any>,
        _context: NodeContext
    ): Promise<NodeExecutionResult> {
        return {
            success: true,
            output: input
        }
    }
}
