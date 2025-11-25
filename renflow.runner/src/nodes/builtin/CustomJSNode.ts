import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

/**
 * 自定义 JS 代码节点
 * 允许用户编写自定义 JavaScript 代码来处理数据
 */
export class CustomJSNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'custom-js',
        name: '自定义代码',
        description: '执行自定义 JavaScript 代码',
        category: 'custom',
        icon: 'code',
        params: [
            {
                key: 'settings',
                label: '',
                type: 'settings',
                required: true
            },
            {
                key: 'code',
                label: 'JavaScript 代码',
                type: 'textarea',
                placeholder: '// 编写你的代码\n// 可用变量:\n// - input: 输入数据\n// - context: 执行上下文\n// 返回处理后的数据\n\nreturn input',
                defaultValue: '// 编写你的代码\nreturn input',
                required: true
            }
        ],
        outputSchema: [
            {
                key: 'result',
                label: '执行结果',
                type: 'any',
                description: '自定义代码的返回值（结构由代码决定）'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const code = params.code || 'return input'

        try {
            // 创建一个安全的执行环境
            // 注意: 这里使用 Function 构造函数,在生产环境中需要考虑安全性
            const func = new Function('input', 'context', code)

            context.logger.log('[自定义代码] 开始执行自定义代码')

            // 执行用户代码
            const result = await func(input, context)

            context.logger.log('[自定义代码] 执行完成,输出:', result)

            return {
                success: true,
                output: result
            }
        } catch (error: any) {
            context.logger.error('[自定义代码] 执行失败:', error.message)

            return {
                success: false,
                error: `代码执行错误: ${error.message}`,
                output: null
            }
        }
    }
}
