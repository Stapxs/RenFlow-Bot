/**
 * 工作流执行数据类型定义
 *
 * 这个模块定义了从 Vue Flow 图形界面转换后的简洁执行数据结构
 */

/**
 * 执行节点 - 简化的节点数据结构
 */
export interface ExecutionNode {
    /** 节点 ID */
    id: string
    /** 节点类型（对应 NodeManager 中的节点 ID） */
    type: string
    /** 节点参数 */
    params: Record<string, any>
    /** 下一个节点的 ID 列表（支持分支） */
    next: string[]
    /** 条件分支配置 */
    branches?: {
        /** 条件为真时的下一个节点 */
        true?: string
        /** 条件为假时的下一个节点 */
        false?: string
        /** 其他分支（用于 switch 等多分支节点） */
        [key: string]: string | undefined
    }
    /** 预期输入个数（用于需要聚合的节点） */
    expectedInputs?: number
}

/**
 * 触发器配置
 */
export interface TriggerConfig {
    /** 触发器类型 */
    type: string
    /** 触发器类型标签（用于显示） */
    typeLabel: string
    /** 触发器名称 */
    name: string
    /** 触发器标签（用于显示） */
    label: string
    /** 触发器参数 */
    params?: Record<string, any>
}

/**
 * 工作流执行数据 - 简化的执行结构
 */
export interface WorkflowExecution {
    /** 工作流 ID */
    id: string
    /** 工作流名称 */
    name: string
    /** 工作流描述 */
    description: string
    /** 触发器配置 */
    trigger: TriggerConfig
    /** 入口节点 ID（触发器后的第一个节点） */
    entryNode: string | null
    /** 执行节点映射表 */
    nodes: Record<string, ExecutionNode>
    /** 创建时间戳 */
    createdAt: number
    /** 更新时间戳 */
    updatedAt: number
}

/**
 * Vue Flow 节点数据（从前端传入）
 */
export interface VueFlowNode {
    id: string
    type?: string
    position: { x: number; y: number }
    data: {
        label?: string
        nodeType?: string
        metadata?: any
        params?: Record<string, any>
        [key: string]: any
    }
}

/**
 * Vue Flow 边数据（从前端传入）
 */
export interface VueFlowEdge {
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
    data?: {
        label?: string
        condition?: string
        [key: string]: any
    }
}

/**
 * Vue Flow 工作流数据（从前端传入的完整数据）
 */
export interface VueFlowWorkflow {
    id: string
    name: string
    description: string
    triggerType: string
    triggerTypeLabel: string
    triggerName: string
    triggerLabel: string
    startParams?: {
        timeout?: number
        [key: string]: any
    }
    nodes: VueFlowNode[]
    edges: VueFlowEdge[]
    createdAt: number
    updatedAt: number
}
