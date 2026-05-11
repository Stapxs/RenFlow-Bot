import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

/**
 * 系统信息节点
 * 在 Node 环境使用 Node `os` 模块；在 Tauri（WebView）环境尝试按需使用 `@tauri-apps/api`，
 * 否则回退到浏览器可用的近似信息。
 */
export class SystemInfoNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'system-info',
        name: '系统信息',
        description: '获取当前运行环境的系统信息（平台、内存、CPU、主机名等）',
        category: 'data',
        icon: 'server',
        params: [],
        outputSchema: [
            { key: 'platform', label: '平台', type: 'string' },
            { key: 'arch', label: '架构', type: 'string' },
            { key: 'release', label: '内核版本', type: 'string' },
            { key: 'uptime', label: '运行时长（秒）', type: 'number' },
            { key: 'cpu_count', label: 'CPU 数量', type: 'number' },
            { key: 'cpu_model', label: 'CPU 型号', type: 'string' },
            { key: 'total_memory', label: '总内存（GB）', type: 'number' },
            { key: 'free_memory', label: '空闲内存（GB）', type: 'number' },
            { key: 'hostname', label: '主机名', type: 'string' },
            { key: 'network_interfaces', label: '网络接口', type: 'object' }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        try {
            const info: Record<string, any> = {}

            // 判断是否为 Node 环境
            const isNode = typeof process !== 'undefined'
                && !!(process.versions && process.versions.node)

            if (isNode) {
                // 在 Node 中按需导入 os 模块
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const os = await import('os') as any
                const cpus = os.cpus() || []
                info.platform = os.platform()
                info.arch = os.arch()
                info.release = os.release()
                info.uptime = os.uptime()
                info.cpu_count = cpus.length
                info.cpu_model = cpus.length > 0 ? cpus[0].model : ''
                info.total_memory = os.totalmem()
                info.free_memory = os.freemem()
                info.hostname = os.hostname()
                info.network_interfaces = os.networkInterfaces()
            } else {
                // 非 Node（可能是浏览器 / tauri WebView）环境，优先尝试通过 tauri 的 invoke 调用后端 Rust 命令获取信息
                let invoke: any = null
                try {
                    invoke = (await import('@tauri-apps/api/core')).invoke
                } catch (_e) {
                    invoke = null
                }

                if (invoke) {
                    try {
                        const data = await invoke('get_system_info', {})
                        if (data && typeof data === 'object') {
                            Object.assign(info, data)
                        }
                    } catch (_err) {
                        // Tauri invoke 失败，继续回退到浏览器 API
                    }
                }

                // 浏览器通用回退：部分信息可以从 navigator/performance 获取
                try {
                    const nav: any = typeof navigator !== 'undefined' ? navigator : null
                    if (!info.platform) info.platform = nav ? nav.platform || (nav.userAgent || '') : 'browser'
                    if (!info.arch && nav && typeof nav.userAgent === 'string') info.arch = nav.userAgent
                    if (!info.cpuCount && typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) {
                        info.cpuCount = (navigator as any).hardwareConcurrency
                    }
                    if (typeof performance !== 'undefined' && (performance as any).memory) {
                        const mem = (performance as any).memory
                        if (!info.totalMemory) info.totalMemory = mem.jsHeapSizeLimit || null
                        if (!info.freeMemory) info.freeMemory = null
                    }
                } catch (_e) {
                    // 忽略
                }

                // 网络接口在浏览器中无法直接获得
                if (!info.networkInterfaces) info.networkInterfaces = null
            }

            // 给 memory 格式化到 GB
            if (info.total_memory && typeof info.total_memory === 'number') {
                info.total_memory = info.total_memory / (1024 * 1024 * 1024)
            }
            if (info.free_memory && typeof info.free_memory === 'number') {
                info.free_memory = info.free_memory / (1024 * 1024 * 1024)
            }
            context.logger.log('SystemInfoNode', 'fetched system info')

            return {
                success: true,
                output: info
            }
        } catch (err) {
            return {
                success: false,
                error: (err as Error).message || '获取系统信息失败'
            }
        }
    }
}
