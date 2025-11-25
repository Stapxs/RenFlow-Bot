import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

/**
 * 注释节点
 * 用于在流程图中添加说明文字
 */
export class NoteNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'note',
        name: '注释',
        description: '添加纯展示的注释说明',
        category: 'data',
        icon: 'sticky-note',
        params: [
            {
                key: 'title',
                label: '标题',
                type: 'input',
                placeholder: '注释标题',
                defaultValue: '注释'
            },
            {
                key: 'content',
                label: '内容',
                type: 'textarea',
                placeholder: '在这里输入注释内容...',
                defaultValue: ''
            },
            {
                key: 'color',
                label: '颜色',
                type: 'select',
                defaultValue: 'yellow',
                options: [
                    { label: '黄色', value: 'yellow' },
                    { label: '蓝色', value: 'blue' },
                    { label: '绿色', value: 'green' },
                    { label: '红色', value: 'red' },
                    { label: '紫色', value: 'purple' }
                ]
            }
        ],
        outputSchema: [
            {
                key: 'input',
                label: '原始输入',
                type: 'any',
                description: '透传的上游节点输出数据'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        // 注释节点不执行任何操作,直接透传输入
        context.logger.log(`[注释] ${params.title || '注释'}: ${params.content || '(无内容)'}`)

        return {
            success: true,
            output: input // 透传输入数据
        }
    }
}
