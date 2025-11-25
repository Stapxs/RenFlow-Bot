import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

/**
 * 自定义节点
 * 使用 Function 构造函数执行用户自定义的代码
 */
export class CustomNode extends BaseNode {
    private userCode: string
    private compiledFunction?: Function

    metadata: NodeMetadata

    constructor(id: string, name: string, description: string, code: string, params: any[] = []) {
        super()
        this.userCode = code
        this.metadata = {
            id,
            name,
            description,
            category: 'custom',
            params,
            isCustom: true
        }
    }

    /**
     * 编译用户代码为函数
     */
    private compileCode(): Function {
        if (this.compiledFunction) {
            return this.compiledFunction
        }

        try {
            // 使用 Function 构造函数创建函数
            // 参数: input, params, context
            // 返回值: 处理后的数据
            this.compiledFunction = new Function('input', 'params', 'context', `
                'use strict';
                ${this.userCode}
            `)
            return this.compiledFunction
        } catch (error) {
            throw new Error(`代码编译失败: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        try {
            const fn = this.compileCode()

            // 创建受限的上下文对象（沙箱）
            const sandboxContext = {
                nodeId: context.nodeId,
                logger: context.logger,
                // 不暴露 globalState，避免用户直接修改
            }

            // 执行用户代码
            const result = fn(input, params, sandboxContext)

            // 支持异步代码
            const output = result instanceof Promise ? await result : result

            return {
                success: true,
                output
            }
        } catch (error) {
            return {
                success: false,
                error: `自定义节点执行失败: ${error instanceof Error ? error.message : String(error)}`
            }
        }
    }
}
