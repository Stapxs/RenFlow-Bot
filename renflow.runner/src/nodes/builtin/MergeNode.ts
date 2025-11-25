import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

// TODO: ALL 模式暂时还没有实现

/**
 * 合并节点
 */
export class MergeNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'merge',
        name: '合并节点',
        description: '将多个输入合并为一个输出',
        category: 'flow',
        icon: 'object-group',
        hidden: true,
        maxInput: -1,
        params: [
            {
                key: 'mode',
                label: '合并模式',
                type: 'select',
                defaultValue: 'ANY',
                tip: '任意模式下游节点接收到任意一个输入即继续执行，所有模式需要等待所有输入到达后才继续执行。其中所有模式会将所有收到的输入合并为一个输出。',
                options: [
                    { label: '所有（等待所有输入）', value: 'ALL' },
                    { label: '任意（任意输入）', value: 'ANY' }
                ]
            },
            {
                key: 'timeout',
                label: '超时 (ms)',
                type: 'number',
                defaultValue: 1000,
                tip: '在所有模式下等待的最大毫秒数。0 表示不启用超时，如果事件没有全部到达则会一直等待。',
                visibleWhen: { key: 'mode', value: 'ALL' }
            },
            {
                key: 'timeoutBehavior',
                label: '超时行为',
                type: 'select',
                defaultValue: 'execute',
                options: [
                    { label: '超时后直接执行（使用已收集到的输入）', value: 'execute' },
                    { label: '超时后抛出异常', value: 'throw' }
                ],
                visibleWhen: { key: 'mode', value: 'ALL' }
            },
        ],
        outputSchema: []
    }

    async execute(
        input: any,
        params: Record<string, any>,
        _context: NodeContext
    ): Promise<NodeExecutionResult> {
        try {
            const mode = params && params.mode ? String(params.mode).toUpperCase() : 'ANY'

            if (mode === 'ANY') {
                // 直接把当前输入作为输出返回；如果需要合并对象，可由 outputToGlobal 参数在 safeExecute 中合并保存
                return {
                    success: true,
                    output: input ?? null
                }
            }

            if (mode === 'ALL') {
                const arr = Array.isArray(input) ? input : []
                return {
                    success: true,
                    output: { inputs: arr }
                }
            }

            return {
                success: false,
                error: `未知的合并模式: ${params?.mode}`
            }
        } catch (err) {
            return {
                success: false,
                error: (err as Error).message || '未知错误',
                output: null
            }
        }
    }
}
