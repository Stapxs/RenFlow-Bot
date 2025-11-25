import { RenMessageBodyData, RenMessageDataType } from '../msgTypes.js'
import { BaseBotAdapter } from '../BotAdapter.js'
import event from '../decorators.js'
import type { AdapterMessage, NapcatAdapterOptions } from '../types.js'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { NapcatRenMessage, NcRenApiData, NcRenApiParamsMessage } from './napcatMsgTypes.js'
import { Logger } from '../../../utils/logger.js'
import type { RenApiData } from '../msgTypes.js'


/**
 * NapcatAdapter: OneBot 协议适配器（Napcat 风格的 websocket 接入）
 * 连接将使用 `${url}?access_token=${token}`
 */
export class NapcatAdapter extends BaseBotAdapter {
    private ws: any | null = null
    private reconnectAttempts = 0
    private reconnectTimer: any = null
    private pendingApiResponses: Map<string, { resolve: (v: any) => void, reject: (e: any) => void, timer?: any }> = new Map()
    private reconnecting = false
    private lastActivity = 0

    protected declare options: NapcatAdapterOptions

    constructor(id: string, opts?: NapcatAdapterOptions) {
        super(id, opts)
    }

    async connect(): Promise<void> {
        if (this.connected) return

        const base = this.options?.url
        if (!base) throw new Error('NapcatAdapter: missing url in options')
        const token = this.options?.token
        const sep = base.includes('?') ? '&' : '?'
        const url = token ? `${base}${sep}access_token=${encodeURIComponent(token)}` : base

        const reconnect = this.options?.reconnect ?? true
        const maxRetries = typeof this.options?.maxRetries === 'number' ? this.options.maxRetries : 5
        const retryInterval = typeof this.options?.retryInterval === 'number' ? this.options.retryInterval : 2000

        // 动态加载 ws（在 Node 环境中可能没有全局 WebSocket）
        let WS: any = (globalThis as any).WebSocket
        if (!WS) {
            try {
                // @ts-ignore
                const mod = await import('ws')
                WS = mod?.default ?? mod?.WebSocket ?? mod
            } catch (e) {
                throw new Error('NapcatAdapter: ws not available and "ws" package not installed')
            }
        }

        const doConnect = (): Promise<void> => {
            return new Promise((resolve, _reject) => {
                try {
                    this.ws = new WS(url)

                    const onOpen = () => {
                        this.reconnectAttempts = 0
                        this.connected = true
                        this.reconnecting = false
                        this.lastActivity = Date.now()
                        this.emitEvent('connected', { id: this.id, source: this.id, timestamp: Date.now() })
                        cleanupListeners()
                        resolve()
                    }

                    const onMessage = (data: any) => {
                        this.lastActivity = Date.now()
                        this.emitEvent('get', { data: data, timestamp: Date.now() } as AdapterMessage)
                    }

                    const onClose = () => {
                        this.connected = false
                        this.reconnecting = false
                        this.rejectAllPending(new Error('WebSocket closed'))
                        this.emitEvent('disconnected', { id: this.id, source: this.id, timestamp: Date.now() })
                        cleanupListeners()
                        if (reconnect) scheduleReconnect()
                    }

                    const onError = (err: any) => {
                        this.emitEvent('error', { error: err })
                        try {
                            // 主动触发关闭以便统一走重连流程
                            if (this.ws && typeof this.ws.close === 'function') this.ws.close()
                        } catch { /* ignore */ }
                        if (reconnect) scheduleReconnect()
                    }

                    const cleanupListeners = () => {
                        try {
                            if (!this.ws) return
                            if (typeof this.ws.removeEventListener === 'function') {
                                this.ws.removeEventListener('open', onOpen as any)
                                this.ws.removeEventListener('message', onMessage as any)
                                this.ws.removeEventListener('close', onClose as any)
                                this.ws.removeEventListener('error', onError as any)
                            }
                            if (typeof this.ws.off === 'function') {
                                this.ws.off('open', onOpen)
                                this.ws.off('message', onMessage)
                                this.ws.off('close', onClose)
                                this.ws.off('error', onError)
                            }
                        } catch (e) { /* ignore */ }
                    }

                    const scheduleReconnect = () => {
                        if (!reconnect) return
                        if (this.reconnecting) return
                        this.reconnecting = true
                        this.reconnectAttempts++
                        if (this.reconnectAttempts > maxRetries) return
                        const base = retryInterval * Math.max(1, Math.pow(2, this.reconnectAttempts - 1))
                        const capped = Math.min(base, 30000)
                        const jitter = Math.floor(capped * (0.2 * Math.random()))
                        const delay = capped + jitter
                        this.reconnectTimer = setTimeout(() => {
                            doConnect().catch(() => { /* swallow */ })
                        }, delay)
                    }

                    if (typeof this.ws.addEventListener === 'function') {
                        this.ws.addEventListener('open', onOpen as any)
                        this.ws.addEventListener('message', (ev: any) => onMessage(ev?.data ?? ev))
                        this.ws.addEventListener('close', onClose as any)
                        this.ws.addEventListener('error', onError as any)
                    } else if (typeof this.ws.on === 'function') {
                        this.ws.on('open', onOpen)
                        this.ws.on('message', onMessage)
                        this.ws.on('close', onClose)
                        this.ws.on('error', onError)
                    }
                } catch (err) {
                    // ignore; schedule reconnect via outer handlers
                }
            })
        }

        await doConnect()
    }

    async disconnect(): Promise<void> {
        if (!this.ws) return
        try { if (typeof this.ws.close === 'function') this.ws.close() } catch (e) { void e }
        this.clearReconnect()
        this.ws = null
        this.connected = false
        this.reconnecting = false
        this.rejectAllPending(new Error('Disconnected'))
        this.emitEvent('disconnected', { id: this.id, source: this.id, timestamp: Date.now() })
    }

    private clearReconnect() {
        try { if (this.reconnectTimer) {clearTimeout(this.reconnectTimer); this.reconnectTimer = null } } catch (e) { void e }
        this.reconnectAttempts = 0
        this.reconnecting = false
    }

    private rejectAllPending(reason: Error) {
        try {
            for (const [echo, entry] of this.pendingApiResponses.entries()) {
                try { if (entry.timer) clearTimeout(entry.timer) } catch { /* ignore */ }
                try { entry.reject(reason) } catch { /* ignore */ }
                this.pendingApiResponses.delete(echo)
            }
        } catch { /* ignore */ }
    }

    // 工具方法 ==================================================

    private formatMessage(data: any[]) {
        return data.map(item => {
            return plainToInstance(NapcatRenMessage, item as { [key: string]: any }, { excludeExtraneousValues: true })
        })
    }

    // 直接通过底层 websocket 发送原始字符串数据，返回 Promise
    private sendRaw(payload: string): Promise<void> {
        if (!this.ws) return Promise.reject(new Error('WebSocket not initialized'))
        try {
            const rs = this.ws.readyState
            // 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED
            if (rs !== 1 && typeof rs === 'number') {
                return Promise.reject(new Error('WebSocket not open'))
            }
        } catch { /* ignore */ }
        try {
            // 浏览器 WebSocket
            if (typeof this.ws.send === 'function') {
                // 如果 send 不支持回调/Promise，则我们无法直接等待成功，只能假定发送成功
                this.ws.send(payload)
                return Promise.resolve()
            }
            // node 'ws' 包（也使用 send 返回 void 或 callback）
            if (typeof this.ws.off === 'function' || typeof this.ws.on === 'function') {
                // 尝试调用 send 并返回已解析的 Promise
                this.ws.send(payload)
                return Promise.resolve()
            }
            // 兜底
            this.ws.send(payload)
            return Promise.resolve()
        } catch (e) {
            return Promise.reject(e)
        }
    }

    // 事件实现 ==================================================

    @event('get')
    async get(msg: AdapterMessage) {
        const logger = new Logger('NapcatAdapter')
        let data: any
        try {
            data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
            logger.debug('recv raw data', data)
        } catch (e) {
            this.emitEvent('error', { error: e })
            return { ok: false }
        }
        // 优先处理带 echo 的 RPC 响应，配合 callApiSync
        try {
            const echo = data?.echo
            if (echo && this.pendingApiResponses.has(echo)) {
                const entry = this.pendingApiResponses.get(echo)!
                try { if (entry.timer) clearTimeout(entry.timer) } catch (e) { /* ignore */ }
                entry.resolve(data)
                this.pendingApiResponses.delete(echo)
                return { ok: true }
            }
        } catch (e) {
            // ignore processing errors and continue
        }
        // 对原始消息进行拆分二次投递事件
        const msgType = data.post_type === 'notice' ? data.sub_type ?? data.notice_type : data.post_type
        logger.debug('parsed msgType', msgType)
        if (msgType == 'message') {
            const msgs = this.formatMessage([data])
            msgs[0].isMine = false
            logger.debug('emit message', msgs[0])
            this.emitEvent('message', msgs[0])
        } else if (msgType == 'message_sent') {
            const msgs = this.formatMessage([data])
            msgs[0].isMine = true
            logger.debug('emit message_mine', msgs[0])
            this.emitEvent('message_mine', msgs[0])
        }
        return { ok: true }
    }

    // 异步调用：接收一个 RenApiData 对象并通过 websocket 发送（不等待响应）
    public async callApiAsync(message: RenApiData): Promise<any> {
        if (!this.ws || !this.connected) throw new Error('NapcatAdapter: WebSocket is not connected')
        const jsonData = instanceToPlain(message as any)
    await this.sendRaw(JSON.stringify(jsonData))
        return
    }

    // 同步调用：接收一个 RenApiData 对象，通过 echo 字段等待服务端响应
    public callApiSync(message: RenApiData): any {
        if (!this.ws || !this.connected) throw new Error('NapcatAdapter: WebSocket is not connected')

        // 将 message 转为 plain 对象，并确保 echo 存在
        const plain = instanceToPlain(message)
        let echo = plain?.echo
        if (!echo) {
            echo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`
            plain.echo = echo
        }

        const payload = JSON.stringify(plain)

        return new Promise((resolve, reject) => {
            const timeout = typeof this.options?.syncTimeout === 'number' ? this.options.syncTimeout : 5000
            const timer = setTimeout(() => {
                this.pendingApiResponses.delete(echo)
                reject(new Error(`callApiSync timeout waiting for echo=${echo}`))
            }, timeout)
            this.pendingApiResponses.set(echo, { resolve, reject, timer })

            // 发送
            try {
                this.sendRaw(payload).catch((err: any) => {
                    try {
                        if (this.pendingApiResponses.has(echo)) {
                            const e = this.pendingApiResponses.get(echo)!
                            if (e.timer) clearTimeout(e.timer)
                            e.reject(err)
                            this.pendingApiResponses.delete(echo)
                        }
                    } catch (_err) { /* ignore */ }
                })
            } catch (e: any) {
                if (this.pendingApiResponses.has(echo)) {
                    const entry = this.pendingApiResponses.get(echo)!
                    if (entry.timer) clearTimeout(entry.timer)
                    entry.reject(e)
                    this.pendingApiResponses.delete(echo)
                }
            }
        })
    }

    // 接口实现 ==================================================

    async apiSendMessage(
        message: {type: RenMessageDataType, data: RenMessageBodyData}[],
        id: number,
        type: 'group' | 'private'
    ): Promise<void> {
        const action = new NcRenApiData(
            'send_message',
            new NcRenApiParamsMessage(
                message,
                type === 'group' ? undefined : id,
                type === 'group' ? id : undefined
            ), 'test'
        )
        // 逆向生成 json
        const jsonData = instanceToPlain<NcRenApiData>(action)
        await this.sendRaw(JSON.stringify(jsonData))
    }
}

export default NapcatAdapter
