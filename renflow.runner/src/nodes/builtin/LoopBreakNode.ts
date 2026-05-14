import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

export class LoopBreakNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'loop-break',
        name: '跳出循环',
        description: '结束最近一层循环并走完成出口',
        category: 'control',
        icon: 'forward',
        maxOutput: 0,
        params: [
            {
                key: 'title',
                label: '节点标题',
                type: 'input',
                defaultValue: '跳出循环',
                placeholder: '跳出循环'
            }
        ],
        outputSchema: [
            { key: 'input', label: '当前输入', type: 'any' }
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
