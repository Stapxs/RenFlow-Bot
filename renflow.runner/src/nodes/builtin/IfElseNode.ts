import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

/**
 * If-Else 条件分支节点
 * 根据条件表达式判断执行哪个分支
 */
export class IfElseNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'ifelse',
        name: '条件分支',
        description: '根据条件判断执行不同分支',
        category: 'flow',
        icon: 'code-branch',
        params: [
            {
                key: 'title',
                label: '节点标题',
                type: 'input',
                placeholder: '条件分支',
                defaultValue: '条件分支'
            },
            {
                key: 'condition',
                label: '条件配置',
                type: 'condition',
                required: true,
                defaultValue: {
                    parameter: 'input',
                    mode: 'exists',
                    value: ''
                }
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
                key: '_branch',
                label: '执行分支',
                type: 'boolean',
                description: '实际执行的分支（true 或 false）'
            },
            {
                key: '_conditionResult',
                label: '条件结果',
                type: 'boolean',
                description: '条件判断的结果'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const condition = params.condition || { parameter: 'input', mode: 'exists', value: '' }

        try {
            let result = false

            // 获取参数值
            let paramValue: any
            if (condition.parameter === 'custom') {
                // 自定义 JS 条件
                const conditionFunc = new Function('input', 'context', condition.customCode || 'return false')
                result = Boolean(await conditionFunc(input, context))
            } else {
                // 标准参数比较
                // 解析参数路径 (例如: "input.value" 或 "input")
                const paramPath = condition.parameter.split('.')[1]
                paramValue = input?.[paramPath]

                // 根据模式判断
                switch (condition.mode) {
                    case 'exists':
                        result = paramValue !== undefined && paramValue !== null
                        break
                    case 'not_exists':
                        result = paramValue === undefined || paramValue === null
                        break
                    case 'equals':
                        result = paramValue == condition.value
                        break
                    case 'not_equals':
                        result = paramValue != condition.value
                        break
                    case 'strict_equals':
                        result = paramValue === condition.value
                        break
                    case 'strict_not_equals':
                        result = paramValue !== condition.value
                        break
                    case 'greater_than':
                        result = Number(paramValue) > Number(condition.value)
                        break
                    case 'less_than':
                        result = Number(paramValue) < Number(condition.value)
                        break
                    case 'greater_or_equal':
                        result = Number(paramValue) >= Number(condition.value)
                        break
                    case 'less_or_equal':
                        result = Number(paramValue) <= Number(condition.value)
                        break
                    case 'contains':
                        result = String(paramValue).includes(String(condition.value))
                        break
                    case 'not_contains':
                        result = !String(paramValue).includes(String(condition.value))
                        break
                    case 'regex':
                        result = new RegExp(condition.value).test(String(paramValue))
                        break
                    default:
                        result = false
                }
            }

            const isTrue = Boolean(result)

            context.logger.log(`[If-Else] 条件判断: ${isTrue}（${paramValue} / ${condition.value}）`)

            return {
                success: true,
                output: {
                    ...input,
                    _branch: isTrue, // 标记走的分支
                    _conditionResult: isTrue
                }
            }
        } catch (error: any) {
            context.logger.error('[If-Else] 条件判断失败:', error.message)

            return {
                success: false,
                error: `条件表达式错误: ${error.message}`,
                output: null
            }
        }
    }
}
