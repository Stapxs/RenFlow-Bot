import { fillTextTemplate } from '../../utils/node.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

interface DictionaryEntry {
    key: string
    value: string
}

function isPlainObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 字典节点
 * 用于构造一组键值对，并携带上游输入一起传递给下游节点
 */
export class DictionaryNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'dictionary',
        name: '字典',
        description: '创建键值对并与上游输入一起输出',
        category: 'data',
        icon: 'book',
        settingsComponent: 'DictionarySettings',
        params: [
            {
                key: 'title',
                label: '节点标题',
                type: 'input',
                placeholder: '字典',
                defaultValue: '字典'
            },
            {
                key: 'settings',
                label: '',
                type: 'settings',
                required: true
            }
        ],
        outputSchema: [
            {
                key: 'input',
                label: '原始输入',
                type: 'any',
                description: '透传的上游节点输出数据'
            },
            {
                key: 'dictionary',
                label: '字典',
                type: 'object',
                description: '当前节点配置生成的键值对字典'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const entries = Array.isArray(params.entries) ? params.entries as DictionaryEntry[] : []
        const dictionary: Record<string, string> = {}

        for (const entry of entries) {
            const rawKey = typeof entry?.key === 'string' ? entry.key.trim() : ''
            if (!rawKey) {
                continue
            }

            const rawValue = typeof entry?.value === 'string' ? entry.value : ''
            dictionary[rawKey] = fillTextTemplate(rawValue, input, context)
        }

        context.logger.log(`[字典] 已生成 ${Object.keys(dictionary).length} 个键值对`)

        return {
            success: true,
            output: {
                ...(isPlainObject(input) ? input : {}),
                ...dictionary,
                input,
                dictionary
            }
        }
    }
}
