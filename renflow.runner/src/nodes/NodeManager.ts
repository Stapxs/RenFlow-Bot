import { BaseNode } from './BaseNode.js'
import { builtinNodes } from './builtin/index.js'
import { CustomNode } from './custom/CustomNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult, NodeCategory, NodeCategoryInfo } from './types.js'
import { Logger, LogLevel } from '../utils/logger.js'

/**
 * 预定义的节点分类信息
 */
const NODE_CATEGORIES: NodeCategoryInfo[] = [
    { id: 'input', name: '输入', description: '数据输入节点', icon: 'arrow-right-to-bracket' },
    { id: 'output', name: '输出', description: '数据输出节点', icon: 'arrow-right-from-bracket' },
    { id: 'transform', name: '转换', description: '数据转换节点', icon: 'rotate' },
    { id: 'control', name: '控制', description: '流程控制节点', icon: 'code-branch' },
    { id: 'logic', name: '逻辑', description: '逻辑判断节点', icon: 'code' },
    { id: 'data', name: '数据', description: '数据处理节点', icon: 'database' },
    { id: 'network', name: '网络', description: '网络请求节点', icon: 'network-wired' },
    { id: 'custom', name: '自定义', description: '用户自定义节点', icon: 'puzzle-piece' },
]

/**
 * 节点管理器
 * 负责管理所有节点（内置 + 自定义），提供节点查询和执行功能
 */
export class NodeManager {
    private nodes: Map<string, BaseNode> = new Map()
    private logger: Logger

    /**
     * 创建节点管理器
     * @param logLevel 日志级别（可选），默认为 INFO
     */
    constructor() {
        this.logger = new Logger('NodeManager')
        this.loadBuiltinNodes()
    }

    /**
     * 加载内置节点
     */
    private loadBuiltinNodes() {
        for (const node of builtinNodes) {
            // 确保参数列表存在
            if (!node.metadata.params) node.metadata.params = []

            // 为所有节点注入一个可配置的 "输出到全局" 开关，避免重复注入
            if (!node.metadata.params.find(p => p.key === 'outputToGlobal')) {
                node.metadata.params.push({
                    pin: true,
                    key: 'outputToGlobal',
                    label: '输出到全局',
                    type: 'switch',
                    defaultValue: true
                })
            }

            this.nodes.set(node.metadata.id, node)
        }
    }

    /**
     * 获取所有节点列表
     * @returns 节点元数据列表
     */
    getNodeList(): NodeMetadata[] {
        const nodes = Array.from(this.nodes.values()).map(node => node.metadata)
        // 排除隐藏的节点
        const filteredNodes = nodes.filter(node => !node.hidden)
        // 按照 category 和 id 排序
        filteredNodes.sort((a, b) => {
            if (a.category === b.category) {
                return a.id.localeCompare(b.id)
            }
            return a.category.localeCompare(b.category)
        })
        return filteredNodes
    }

    /**
     * 根据节点 ID 获取节点元数据
     * @param nodeId 节点 ID
     * @returns 节点元数据，如果不存在返回 null
     */
    getNodeMetadata(nodeId: string): NodeMetadata | null {
        const node = this.nodes.get(nodeId)
        return node ? node.metadata : null
    }

    /**
     * 获取节点的参数配置
     * @param nodeId 节点 ID
     * @returns 参数配置列表
     */
    getNodeParams(nodeId: string) {
        const metadata = this.getNodeMetadata(nodeId)
        return metadata ? metadata.params : []
    }

    /**
     * 执行节点
     * @param nodeId 节点 ID
     * @param input 输入数据
     * @param params 节点参数
     * @param context 执行上下文（可选）
     * @returns 执行结果
     */
    async executeNode(
        nodeId: string,
        nodeType: string,
        input: any,
        params: Record<string, any>,
        context?: Partial<NodeContext>
    ): Promise<NodeExecutionResult> {
        const node = this.nodes.get(nodeType)

        if (!node) {
            return {
                success: false,
                error: `节点不存在: ${nodeType}`
            }
        }

        /* eslint-disable no-console */

        // 构建完整的执行上下文
        const fullContext: NodeContext = {
            nodeId,
            nodeType,
            globalState: context?.globalState || new Map(),
            logger: context?.logger || {
                log: (...args) => console.log(...args),
                error: (...args) => console.error(...args),
                warn: (...args) => console.warn(...args)
            }
        }

        /* eslint-enable no-console */

        // 执行节点
        return await node.safeExecute(input, params, fullContext)
    }

    /**
     * 注册自定义节点
     * @param id 节点 ID
     * @param name 节点名称
     * @param description 节点描述
     * @param code 用户代码
     * @param params 参数配置
     * @returns 是否注册成功
     */
    registerCustomNode(
        id: string,
        name: string,
        description: string,
        code: string,
        params: any[] = []
    ): { success: boolean; error?: string } {
        try {
            // 检查 ID 是否已存在
            if (this.nodes.has(id)) {
                return {
                    success: false,
                    error: `节点 ID 已存在: ${id}`
                }
            }

            // 创建自定义节点
            const customNode = new CustomNode(id, name, description, code, params)
            this.nodes.set(id, customNode)

            this.logger.info(`已注册自定义节点: ${name} (${id})`)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }
        }
    }

    /**
     * 删除自定义节点
     * @param nodeId 节点 ID
     * @returns 是否删除成功
     */
    removeCustomNode(nodeId: string): boolean {
        const node = this.nodes.get(nodeId)

        if (!node) {
            return false
        }

        // 只能删除自定义节点
        if (!node.metadata.isCustom) {
            this.logger.error(null, `无法删除内置节点: ${nodeId}`)
            return false
        }

        this.nodes.delete(nodeId)
        this.logger.info(`已删除自定义节点: ${nodeId}`)
        return true
    }

    /**
     * 按分类获取节点列表
     * @param category 节点分类
     * @returns 节点元数据列表
     */
    getNodesByCategory(category: NodeCategory): NodeMetadata[] {
        return this.getNodeList().filter(node => node.category === category)
    }

    /**
     * 获取所有分类信息
     * @returns 分类信息列表
     */
    getCategories(): NodeCategoryInfo[] {
        return NODE_CATEGORIES
    }

    /**
     * 获取指定分类信息
     * @param categoryId 分类 ID
     * @returns 分类信息，如果不存在返回 null
     */
    getCategoryInfo(categoryId: NodeCategory): NodeCategoryInfo | null {
        return NODE_CATEGORIES.find(cat => cat.id === categoryId) || null
    }

    /**
     * 获取分组后的节点列表（按分类分组）
     * @returns 分组后的节点列表 { 分类ID: 节点列表 }
     */
    getGroupedNodes(): Record<NodeCategory, NodeMetadata[]> {
        const grouped: Record<string, NodeMetadata[]> = {}

        // 初始化所有分类
        for (const category of NODE_CATEGORIES) {
            grouped[category.id] = []
        }

        // 将节点分组
        for (const node of this.getNodeList()) {
            if (!grouped[node.category]) {
                grouped[node.category] = []
            }
            grouped[node.category].push(node)
        }

        return grouped as Record<NodeCategory, NodeMetadata[]>
    }

    /**
     * 设置日志级别
     * @param level 日志级别
     */
    setLogLevel(level: LogLevel) {
        Logger.setLogLevel(level)
        this.logger.info(`日志级别已设置为: ${LogLevel[level]}`)
    }
}

// 导出单例
export const nodeManager = new NodeManager()

/**
 * 创建一个新的节点管理器实例
 * @param logLevel 日志级别（可选）
 * @returns 新的节点管理器实例
 */
export function createNodeManager(logLevel?: LogLevel): NodeManager {
    const nm = new NodeManager()
    if (logLevel !== undefined) {
        nm.setLogLevel(logLevel)
    }
    return nm
}
