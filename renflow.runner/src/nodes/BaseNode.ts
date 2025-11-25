import { Logger } from '../utils/logger.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from './types.js'

/**
 * 节点基类
 */
export abstract class BaseNode {
    /** 节点元数据 */
    abstract metadata: NodeMetadata

    logger = new Logger('BaseNode')

    /**
     * 写入全局存储
     * @param context 节点执行上下文
     * @param key 键
     * @param value 值
     */
    protected setGlobal(context: NodeContext, key: string, value: any): void {
        if (!context) return
        if (!context.globalState) {
            // 尽量保证存在一个 Map
            // eslint-disable-next-line no-param-reassign
            (context as any).globalState = new Map()
        }
        context.globalState.set(key, value)
    }

    /**
     * 删除全局存储中的键
     * @param context 节点执行上下文
     * @param key 键
     * @returns 是否删除成功
     */
    protected removeGlobal(context: NodeContext, key: string): boolean {
        if (!context || !context.globalState) return false
        return context.globalState.delete(key)
    }

    /**
     * 判断全局存储是否存在键
     */
    protected hasGlobal(context: NodeContext, key: string): boolean {
        if (!context || !context.globalState) return false
        return context.globalState.has(key)
    }

    /**
     * 清空当前执行上下文的全局存储（谨慎使用）
     */
    protected clearGlobal(context: NodeContext): void {
        if (!context || !context.globalState) return
        context.globalState.clear()
    }

    /**
     * 执行节点
     * @param input 输入数据
     * @param params 节点参数（用户配置的参数值）
     * @param context 执行上下文
     * @returns 执行结果
     */
    abstract execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult>

    /**
     * 验证参数
     * @param params 参数对象
     * @returns 验证结果，如果验证失败返回错误信息
     */
    protected validateParams(params: Record<string, any>): string | null {
        for (const paramConfig of this.metadata.params) {
            if(paramConfig.type == 'settings') continue
            if (paramConfig.required && !params[paramConfig.key]) {
                return `参数 "${paramConfig.label} (${paramConfig.key})" 是必填项`
            }
        }
        return null
    }

    /**
     * 安全执行节点（包含错误处理）
     * @param input 输入数据
     * @param params 节点参数
     * @param context 执行上下文
     * @returns 执行结果
     */
    async safeExecute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        try {
            // 验证参数
            const validationError = this.validateParams(params)
            if (validationError) {
                return {
                    success: false,
                    error: validationError
                }
            }

            // 执行节点
            const result = await this.execute(input, params, context)

            // 当节点配置了 outputToGlobal 时，把输出写入全局变量，键名为节点 id（合并存在数据）
            try {
                if (result && result.success && params && params.outputToGlobal) {
                    const nodeKey = context.nodeId
                    let existing: any = {}
                    if (context.globalState && context.globalState.has(nodeKey)) {
                        existing = context.globalState.get(nodeKey)
                    }

                    // 如果已有值不是对象，则覆盖为对象
                    const base = existing && typeof existing === 'object' ? existing : {}

                    const newVal = {
                        ...base,
                        ...result.output
                    }

                    this.setGlobal(context, nodeKey, newVal)
                }
            } catch (_err) {
                // 忽略写入全局时可能发生的错误，保持节点主流程不受影响
            }

            return result
        } catch (error) {
            context.logger.error(this.metadata.name, error)
            return {
                success: false,
                error: (error as unknown as Error).message || '未知错误'
            }
        }
    }
}
