/**
 * 节点参数类型
 */
export type NodeParamType = 'input' | 'switch' | 'textarea' | 'number' | 'select' | 'settings' | 'condition'

/**
 * 节点参数配置
 */
export interface NodeParam {
    /** 参数 key */
    key: string
    /** 参数显示名称 */
    label: string
    /** 参数类型 */
    type: NodeParamType
    /** 是否固定显示在节点上（即使参数面板被隐藏） */
    pin?: boolean
    /** 默认值 */
    defaultValue?: any
    /** 是否必填 */
    required?: boolean
    /** 提示信息 */
    placeholder?: string,
    /** 说明文字 */
    tip?: string,
    /** 下拉选项（type 为 select 时使用） */
    options?: Array<{ label: string; value: any }>
    /** 是否支持动态值（从上游节点获取） */
    dynamic?: boolean,
    /** 可选：参数显示条件 */
    visibleWhen?: { key: string; value: any }
}

/**
 * 输出字段定义
 */
export interface OutputField {
    /** 字段 key */
    key: string
    /** 字段显示名称 */
    label: string
    /** 字段类型 */
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
    /** 字段描述 */
    description?: string
}

/**
 * 节点分类（用于 UI 展示分组）
 */
export type NodeCategory = 'input' | 'output' | 'transform' | 'control' | 'logic' | 'data' | 'network' | 'llm' | 'bot' | 'flow' | 'custom'

/**
 * 节点分类信息
 */
export interface NodeCategoryInfo {
    id: NodeCategory
    name: string
    description: string
    icon?: string
}

/**
 * 节点元数据
 */
export interface NodeMetadata {
    /** 节点类型 ID */
    id: string
    /** 节点显示名称 */
    name: string
    /** 节点描述 */
    description: string
    /** 节点完整描述 */
    fullDescription?: string
    /** 节点分类（用于 UI 展示分组） */
    category: NodeCategory
    /** 是否隐藏节点（不在节点列表中显示） */
    hidden?: boolean
    /** 最大输入连接数，-1 表示不限制 */
    maxInput?: number
    /** 最大输出连接数，-1 表示不限制 */
    maxOutput?: number
    /** 节点参数配置 */
    params: NodeParam[]
    /** 输出数据结构定义 */
    outputSchema?: OutputField[]
    /** 是否为自定义节点 */
    isCustom?: boolean
    /** 节点图标（可选） */
    icon?: string
    /** 可选：节点专属设置组件名（放在前端 components 目录下的组件文件名，不含扩展名） */
    settingsComponent?: string
}

export interface NodeContext {
    /** 节点 ID */
    nodeId: string
    /** 节点类型 */
    nodeType: string
    /** 全局状态（可用于节点间共享数据） */
    globalState: Map<string, any>
    /** 日志记录器 */
    logger: {
        log: (...args: any[]) => void
        error: (...args: any[]) => void
        warn: (...args: any[]) => void
    }
    agentCallbacks?: Record<string, (...args: any[]) => void>
}

/**
 * 节点执行结果
 */
export interface NodeExecutionResult {
    /** 是否执行成功 */
    success: boolean
    /** 输出数据 */
    output?: any
    /** 错误信息 */
    error?: string
}
