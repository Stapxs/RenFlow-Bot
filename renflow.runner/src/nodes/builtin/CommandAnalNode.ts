import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'
import shellQuote from 'shell-quote'
import mri from 'mri'
import { fillTextTemplate } from '../../utils/node.js'

/**
 * 命令解析器
 */
export class CommandAnalNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'command-anal',
        name: '命令解析器',
        description: '对符合 shell 命令格式的文本进行解析',
        category: 'data',
        icon: 'box-open',
        params: [
            {
                key: 'text',
                label: '命令文本',
                type: 'input',
                placeholder: '输入要解析的命令文本',
                required: true,
                dynamic: true,
                defaultValue: '{trigger.rawMessage}'
            }
        ],
        outputSchema: [
            {
                key: 'data',
                label: '解析内容',
                type: 'object',
                description: '包含命令名称和参数的对象'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const text = fillTextTemplate(params.text, input, context)

        const rawTokens = shellQuote.parse(text)
        const tokens = rawTokens.filter((t): t is string => typeof t === 'string')
        const argv = mri(tokens)

        return {
            success: true,
            output: {
                data: argv
            }
        }
    }
}
