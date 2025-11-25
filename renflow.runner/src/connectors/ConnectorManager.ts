// 简易的连接器管理器

import { RenApiData } from './adapter/msgTypes'

// 负责注册/获取适配器，并提供队列适配器的工厂方法
export class ConnectorManager {
    private adapters: Map<string, any> = new Map()

    // 注册一个命名适配器（任意类型：queue / bot adapter 等）
    registerAdapter(id: string, adapter: any) {
        this.adapters.set(id, adapter)
    }

    /**
     * 通过 adapterId 调用适配器导出的 @api 方法
     * 如果适配器未注册或不支持 callApi，将抛出错误
     */
    async callAdapterApi(adapterId: string, message: RenApiData): Promise<any> {
        const adapter = this.adapters.get(adapterId)
        if (!adapter) throw new Error(`未找到适配器: ${adapterId}`)
        if (typeof adapter.callApiAsync !== 'function') throw new Error(`适配器不支持 callApiAsync: ${adapterId}`)
        return await adapter.callApiAsync(message)
    }

    // 注销适配器
    unregisterAdapter(id: string) {
        this.adapters.delete(id)
    }

    // 获取已注册的适配器
    getAdapter<T = any>(id: string): T | undefined {
        return this.adapters.get(id) as T | undefined
    }

    // 创建 BotAdapter 的简单工厂
    async createBotAdapter(type: string, opts: any, adapterId?: string) {
        const id = adapterId || `bot-${Math.random().toString(36).slice(2, 8)}`

        // 如果 id 已存在，抛出错误
        if (this.adapters.has(id)) {
            throw new Error(`已存在适配器: ${id}`)
        }

        if (type === 'napcat') {
            // 支持 OneBot 实现（Napcat）
            const mod = await import('./adapter/onebot/NapcatAdapter')
            const NapcatAdapter = (mod && (mod.NapcatAdapter || mod.default))
            if (!NapcatAdapter) throw new Error('NapcatAdapter not found')
            const adapter = new NapcatAdapter(id, opts)
            this.registerAdapter(id, adapter)
            return adapter
        }

        throw new Error(`未实现的 Bot 适配器类型: ${type}`)
    }

    getAllSupportedAdapterTypes(): string[] {
        return [
            'napcat',
        ]
    }
}

// 包内单例管理器（便于简单用法）
export const connectorManager = new ConnectorManager()

export default ConnectorManager
