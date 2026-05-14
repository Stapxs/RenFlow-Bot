import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

export class LoopStartNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'loop-start',
        name: '循环',
        description: '按次数或遍历集合执行循环体',
        fullDescription: '拖入后会自动生成配对的循环结束节点，执行器会以原生控制流处理该结构。',
        category: 'control',
        icon: 'repeat',
        maxOutput: 1,
        params: [
            {
                key: 'title',
                label: '节点标题',
                type: 'input',
                defaultValue: '循环',
                placeholder: '循环'
            },
            {
                key: 'mode',
                label: '循环模式',
                type: 'select',
                defaultValue: 'count',
                options: [
                    { label: '次数循环', value: 'count' },
                    { label: '遍历集合', value: 'iterate' }
                ]
            },
            {
                key: 'count',
                label: '循环次数',
                type: 'input',
                defaultValue: '1',
                placeholder: '请输入大于等于 0 的数字',
                visibleWhen: { key: 'mode', value: 'count' }
            },
            {
                key: 'source',
                label: '遍历来源',
                type: 'input',
                defaultValue: 'input.items',
                placeholder: '例如 input.items',
                visibleWhen: { key: 'mode', value: 'iterate' }
            },
            {
                key: 'resultMode',
                label: '结果模式',
                type: 'select',
                defaultValue: 'collect',
                options: [
                    { label: '收集每轮结果', value: 'collect' },
                    { label: '保留最后结果', value: 'last' }
                ]
            }
        ],
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
