import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

/**
 *  日志节点
 */

/* eslint-disable no-console */
export class ConsoleNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'console-log',
        name: '日志',
        description: '将内容写入到运行日志中',
        category: 'output',
        icon: 'terminal',
        params: [
            {
                key: 'message',
                label: '输出内容',
                type: 'input',
                required: true,
                placeholder: '请输入要输出的内容',
                dynamic: true
            },
            {
                key: 'logLevel',
                label: '日志级别',
                type: 'select',
                defaultValue: 'log',
                options: [
                    { label: '普通', value: 'log' },
                    { label: '警告', value: 'warn' },
                    { label: '错误', value: 'error' }
                ]
            },
            {
                key: 'includeInput',
                label: '包含输入',
                type: 'switch',
                defaultValue: true
            }
        ],
        outputSchema: [
            {
                key: 'logs',
                label: '日志内容',
                type: 'string',
                description: '输出的日志内容'
            },
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
        console.log(input)
        const { message, logLevel = 'log', includeInput = false } = params

        // 模板渲染：支持使用 {path.to.field} 语法引用 input 中的字段
        const resolvePath = (obj: any, path: string) => {
            if (!obj || !path) return undefined
            // 支持 a.b.c 或 a[0].b 或 a.0.b 形式
            const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
            let cur: any = obj
            for (const p of parts) {
                if (cur === undefined || cur === null) return undefined
                // 如果是数字索引，转换为 number
                const idx = Number(p)
                if (!Number.isNaN(idx) && Array.isArray(cur)) {
                    cur = cur[idx]
                } else {
                    cur = cur[p]
                }
            }
            return cur
        }

        const renderTemplate = (tpl: string, ctxObj: any) => {
            if (tpl === undefined || tpl === null) return ''
            return String(tpl).replace(/\{([^}]+)\}/g, (_m, p1) => {
                try {
                    const val = resolvePath(ctxObj, p1.trim())
                    if (val === undefined) return ''
                    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
                    return JSON.stringify(val)
                } catch (e) {
                    return ''
                }
            })
        }

        // 构建输出内容（渲染模板）
        let outputMessage = renderTemplate(message, input)
        if (includeInput) {
            outputMessage = `${outputMessage} | 输入数据: ${JSON.stringify(input)}`
        }

        // 根据日志级别输出
        switch (logLevel) {
            case 'warn':
                context.logger.warn(outputMessage)
                if (includeInput) {
                    console.warn(outputMessage, input)
                } else {
                    console.warn(outputMessage)
                }
                break
            case 'error':
                context.logger.error(outputMessage)
                if (includeInput) {
                    console.error(outputMessage, input)
                } else {
                    console.error(outputMessage)
                }
                break
            default:
                context.logger.log(outputMessage)
                if (includeInput) {
                    console.log(outputMessage, input)
                } else {
                    console.log(outputMessage)
                }
        }

        return {
            success: true,
            output: {
                logs: outputMessage,
                input: input
            }
        }
    }
}
