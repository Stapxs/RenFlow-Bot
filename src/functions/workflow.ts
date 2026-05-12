/**
 * 工作流存储模块
 * 支持 LocalStorage (Web) 和 Tauri Store (Desktop)
 */

import type { Node, Edge } from '@vue-flow/core'
import { backend } from './backend'
import { Logger, LogType } from './base'

const logger = new Logger()

/**
 * 工作流数据结构
 */
export interface WorkflowData {
    id: string                      // 工作流唯一 ID
    name: string                    // 工作流名称
    description: string             // 工作流描述
    triggerType: string             // 触发器类型
    triggerTypeLabel: string        // 触发器类型标签
    triggerName: string             // 触发器名称
    triggerLabel: string            // 触发器标签
    /** 启动参数：在执行或启用工作流时传入的参数 */
    startParams?: {
        timeout?: number
        [key: string]: any
    }
    /** 是否启用（用于切换执行/启用状态） */
    enabled?: boolean
    nodes: Node[]                   // 节点列表
    edges: Edge[]                   // 连接线列表
    createdAt: number               // 创建时间戳
    updatedAt: number               // 更新时间戳
}

/**
 * 工作流列表项（用于列表展示）
 */
export interface WorkflowListItem {
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
    enabled?: boolean
    createdAt: number
    updatedAt: number
}

/**
 * 工作流存储管理器
 */
export class WorkflowStorage {
    private static readonly STORAGE_KEY = 'renflow_workflows'
    private static readonly STORE_FILE = 'workflows.dat'

    /**
     * 生成唯一 ID
     */
    private static generateId(): string {
        return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * 保存工作流
     * @param workflow 工作流数据
     * @returns 保存后的工作流数据（包含 ID）
     */
    static async save(workflow: Partial<WorkflowData>): Promise<WorkflowData> {
        const now = Date.now()

        // 如果没有 ID，生成新 ID
        if (!workflow.id) {
            workflow.id = this.generateId()
            workflow.createdAt = now
        }

        workflow.updatedAt = now

        // 确保必填字段存在
        const fullWorkflow: WorkflowData = {
            id: workflow.id,
            name: workflow.name || '未命名工作流',
            description: workflow.description || '',
            triggerType: workflow.triggerType || '',
            triggerTypeLabel: workflow.triggerTypeLabel || workflow.triggerType || '',
            triggerName: workflow.triggerName || '',
            triggerLabel: workflow.triggerLabel || workflow.triggerName || '',
            startParams: workflow.startParams || {},
            enabled: workflow.enabled !== undefined ? workflow.enabled : false,
            nodes: workflow.nodes || [],
            edges: workflow.edges || [],
            createdAt: workflow.createdAt || now,
            updatedAt: now
        }

        try {
            if (backend.isDesktop()) {
                // Tauri 环境：使用 Tauri Store
                await this.saveTauriStore(fullWorkflow)
            } else {
                // Web 环境：使用 LocalStorage
                await this.saveLocalStorage(fullWorkflow)
            }

            logger.add(LogType.INFO, `工作流已保存: ${fullWorkflow.name} (${fullWorkflow.id})`)
            return fullWorkflow
        } catch (error) {
            logger.add(LogType.ERR, '保存工作流失败', error)
            throw error
        }
    }

    /**
     * 加载工作流
     * @param id 工作流 ID
     * @returns 工作流数据
     */
    static async load(id: string): Promise<WorkflowData | null> {
        try {
            if (backend.isDesktop()) {
                return await this.loadTauriStore(id)
            } else {
                return await this.loadLocalStorage(id)
            }
        } catch (error) {
            logger.add(LogType.ERR, '加载工作流失败', error)
            return null
        }
    }

    /**
     * 获取工作流列表
     * @returns 工作流列表
     */
    static async list(): Promise<WorkflowListItem[]> {
        try {
            if (backend.isDesktop()) {
                return await this.listTauriStore()
            } else {
                return await this.listLocalStorage()
            }
        } catch (error) {
            logger.add(LogType.ERR, '获取工作流列表失败', error)
            return []
        }
    }

    /**
     * 删除工作流
     * @param id 工作流 ID
     */
    static async delete(id: string): Promise<void> {
        try {
            if (backend.isDesktop()) {
                await this.deleteTauriStore(id)
            } else {
                await this.deleteLocalStorage(id)
            }

            logger.add(LogType.INFO, `工作流已删除: ${id}`)
        } catch (error) {
            logger.add(LogType.ERR, '删除工作流失败', error)
            throw error
        }
    }

    // ==================== LocalStorage 实现 ====================

    /**
     * 使用 LocalStorage 保存工作流
     */
    private static async saveLocalStorage(workflow: WorkflowData): Promise<void> {
        const workflows = this.getAllFromLocalStorage()
        const index = workflows.findIndex(w => w.id === workflow.id)

        if (index >= 0) {
            workflows[index] = workflow
        } else {
            workflows.push(workflow)
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(workflows))
    }

    /**
     * 使用 LocalStorage 加载工作流
     */
    private static async loadLocalStorage(id: string): Promise<WorkflowData | null> {
        const workflows = this.getAllFromLocalStorage()
        return workflows.find(w => w.id === id) || null
    }

    /**
     * 使用 LocalStorage 获取工作流列表
     */
    private static async listLocalStorage(): Promise<WorkflowListItem[]> {
        const workflows = this.getAllFromLocalStorage()
        return workflows.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            triggerType: w.triggerType,
            triggerTypeLabel: w.triggerTypeLabel,
            triggerName: w.triggerName,
            triggerLabel: w.triggerLabel,
            startParams: w.startParams || {},
            enabled: w.enabled || false,
            createdAt: w.createdAt,
            updatedAt: w.updatedAt
        }))
    }

    /**
     * 使用 LocalStorage 删除工作流
     */
    private static async deleteLocalStorage(id: string): Promise<void> {
        const workflows = this.getAllFromLocalStorage()
        const filtered = workflows.filter(w => w.id !== id)
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered))
    }

    /**
     * 从 LocalStorage 获取所有工作流
     */
    private static getAllFromLocalStorage(): WorkflowData[] {
        const data = localStorage.getItem(this.STORAGE_KEY)
        if (!data) return []

        try {
            return JSON.parse(data)
        } catch (error) {
            logger.add(LogType.ERR, 'LocalStorage 数据解析失败', error)
            return []
        }
    }

    // ==================== Tauri Store 实现 ====================

    /**
     * 使用 Tauri Store 保存工作流
     */
    private static async saveTauriStore(workflow: WorkflowData): Promise<void> {
        // 获取现有工作流列表
        const workflows = await this.getAllFromTauriStore()
        const index = workflows.findIndex(w => w.id === workflow.id)

        if (index >= 0) {
            workflows[index] = workflow
        } else {
            workflows.push(workflow)
        }

        // 保存到 Tauri Store
        await backend.call('sys:setStoreValue', {
            key: this.STORAGE_KEY,
            value: JSON.stringify(workflows)
        })
    }

    /**
     * 使用 Tauri Store 加载工作流
     */
    private static async loadTauriStore(id: string): Promise<WorkflowData | null> {
        const workflows = await this.getAllFromTauriStore()
        return workflows.find(w => w.id === id) || null
    }

    /**
     * 使用 Tauri Store 获取工作流列表
     */
    private static async listTauriStore(): Promise<WorkflowListItem[]> {
        const workflows = await this.getAllFromTauriStore()
        return workflows.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            triggerType: w.triggerType,
            triggerTypeLabel: w.triggerTypeLabel,
            triggerName: w.triggerName,
            triggerLabel: w.triggerLabel,
            startParams: w.startParams || {},
            enabled: w.enabled || false,
            createdAt: w.createdAt,
            updatedAt: w.updatedAt
        }))
    }

    /**
     * 使用 Tauri Store 删除工作流
     */
    private static async deleteTauriStore(id: string): Promise<void> {
        const workflows = await this.getAllFromTauriStore()
        const filtered = workflows.filter(w => w.id !== id)

        await backend.call('sys:setStoreValue', {
            key: this.STORAGE_KEY,
            value: JSON.stringify(filtered)
        })
    }

    /**
     * 从 Tauri Store 获取所有工作流
     */
    private static async getAllFromTauriStore(): Promise<WorkflowData[]> {
        const data = await backend.call('sys:getStoreValue', { key: this.STORAGE_KEY })

        if (!data) return []

        try {
            return JSON.parse(data as string)
        } catch (error) {
            logger.add(LogType.ERR, 'Tauri Store 数据解析失败', error)
            return []
        }
    }
}
