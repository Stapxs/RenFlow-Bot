/**
 * Ren Flow Runner
 * 独立的工作流执行引擎，支持 OneBot 协议连接
 */

import 'reflect-metadata'

import { Logger, LogLevel } from './utils/logger'
import { nodeManager } from './nodes/index'
import path from 'path'
import fs from 'fs/promises'
import readline from 'readline'
import { runWorkflowByTrigger, WorkflowConverter, WorkflowEngine } from './workflow/index'

// 检测是否在 Node.js 环境中运行
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node

// 全局可调用的优雅关闭函数（当 main 启动适配器时会被赋值）
let performGlobalShutdown: (() => Promise<void>) | undefined = undefined

async function main() {
    const logger = new Logger('Main')
    // 支持通过环境变量开启调试日志：RENFLOW_LOG=debug
    if (process.env.RENFLOW_LOG === 'debug' || process.env.DEBUG === '1') {
        Logger.setLogLevel(LogLevel.DEBUG)
        logger.info('调试日志已启用')
    }
    logger.info('Ren Flow Runner 启动中...')

    if (isNode) {
        logger.info(`Node.js 版本: ${process.version}`)
        logger.info(`平台: ${process.platform} ${process.arch}`)
    }

    // TODO: 初始化 OneBot 连接
    // TODO: 加载工作流配置
    // 如果命令行传入了一个 JSON 文件，则直接加载并运行该工作流
    if (isNode) {
        const arg = process.argv[2]
        if (arg) {
            try {
                const resolved = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg)
                const stat = await fs.stat(resolved)
                if (stat.isFile()) {
                    if (resolved.endsWith('.json')) {
                        logger.info(`检测到工作流 JSON 文件，正在加载: ${resolved}`)
                        const content = await fs.readFile(resolved, { encoding: 'utf-8' })
                        const json = JSON.parse(content)

                        let workflowExecution: any = null
                        if (Array.isArray(json.nodes) && Array.isArray(json.edges)) {
                            const converter = new WorkflowConverter()
                            workflowExecution = converter.convert(json)
                        } else if (json && typeof json.nodes === 'object' && json.entryNode !== undefined) {
                            workflowExecution = json
                        } else {
                            throw new Error('无法识别的工作流 JSON 格式')
                        }

                        const engine = new WorkflowEngine()
                        const result = await engine.execute(workflowExecution, null)
                        if (!result.success) {
                            logger.error('工作流执行失败 > ', result.error)
                            process.exit(2)
                        }
                        logger.info('工作流执行成功')
                        process.exit(0)
                    } else if (resolved.endsWith('.renflow') || resolved.endsWith('.rfw') || resolved.endsWith('.zip')) {
                        logger.info(`检测到工作集包，正在加载: ${resolved}`)

                        const { default: AdmZip } = await import('adm-zip')
                        const zip = new AdmZip(resolved)
                        const entries = zip.getEntries()
                        const botsEntry = entries.find((e: any) => e.entryName === 'bots.config')
                        const workflows: any[] = []

                        if (!botsEntry) {
                            throw new Error('包内缺少 bots.config')
                        }
                        const botsConfig = JSON.parse(botsEntry.getData().toString('utf-8')) as Array<{ id: string, name: string, type: string, address: string, token?: string }>

                        for (const e of entries) {
                            if (e.entryName.endsWith('.json') && e.entryName !== 'bots.config') {
                                try {
                                    const content = e.getData().toString('utf-8')
                                    const json = JSON.parse(content)
                                    if (Array.isArray(json.nodes) && Array.isArray(json.edges)) {
                                        const converter = new WorkflowConverter()
                                        workflows.push(converter.convert(json))
                                    } else if (json && typeof json.nodes === 'object' && json.entryNode !== undefined) {
                                        workflows.push(json)
                                    }
                                } catch (err) {
                                    logger.warn(`解析工作流失败: ${e.entryName} > ${String(err)}`)
                                }
                            }
                        }

                        logger.info(`已加载 ${workflows.length} 个工作流，准备连接 ${botsConfig.length} 个连接`)

                        const { connectorManager } = await import('./connectors/index')
                        const adapters: any[] = []

                        // 在缺少 token 时询问用户输入
                        const promptTokenForBot = async (bot: any) => {
                            return new Promise<string>((resolve) => {
                                try {
                                    const rl = readline.createInterface({ input: process.stdin, output: process.stdout }) as any
                                    const promptText = `请输入 token (${bot.name || bot.id || bot.address}): `

                                    // 禁用输入回显：重写 _writeToOutput，在输入时不向 stdout 输出任何字符
                                    rl._writeToOutput = function _writeToOutput(stringToWrite: string) {
                                        if (stringToWrite && stringToWrite.indexOf(promptText) !== -1) {
                                            rl.output.write(promptText)
                                            return
                                        }
                                    }

                                    rl.question(promptText, (answer: string) => {
                                        try { rl.close() } catch (e) { /* ignore */ }
                                        resolve((answer || '').trim())
                                    })
                                } catch (e) {
                                    resolve('')
                                }
                            })
                        }

                        for (const bot of botsConfig) {
                            try {
                                // 如果配置中没有 token，则在 CLI 环境提示用户输入
                                if (!bot.token && isNode) {
                                    try {
                                        const t = await promptTokenForBot(bot)
                                        // eslint-disable-next-line no-console
                                        console.log() // 换行
                                        if (t) bot.token = t
                                    } catch (e) { /* ignore */ }
                                }
                                const adapter = await connectorManager.createBotAdapter(bot.type, { url: bot.address, token: bot.token }, bot.id)
                                adapters.push(adapter)
                                adapter.on(['message','message_mine'], (p: any) => {
                                    const eventName = p.isMine ? 'message_mine' : 'message'
                                    const relevant = workflows.filter(w => w.trigger?.name === eventName || w.trigger?.label === eventName)
                                    runWorkflowByTrigger(relevant, p, { timeout: 60000, bot: adapter }).catch(() => void 0)
                                })
                                adapter.on('connected', () => logger.info(`适配器已连接: ${bot.id}`))
                                adapter.on('disconnected', () => logger.warn(`适配器已断开: ${bot.id}`))
                                adapter.on('error', (err: any) => logger.error(`适配器错误: ${bot.id}`, err))
                                await adapter.connect()
                            } catch (err) {
                                logger.error(`连接适配器失败: ${bot.id}`, err)
                            }
                        }

                        logger.info('工作集已启动，等待事件触发...')

                        // 等待退出信号，优雅断开所有适配器
                        // 确保进程不会因为没有活跃事件而退出：resume stdin 保持事件循环活跃
                        try {
                            if (process.stdin && typeof process.stdin.resume === 'function') {
                                process.stdin.resume()
                            }
                        } catch (e) {
                            // ignore
                        }

                        const shutdownPromise = new Promise<void>((resolve) => {
                            const doShutdown = async () => {
                                logger.info('接收到退出信号，正在关闭适配器...')
                                for (const a of adapters) {
                                    try {
                                        if (typeof a.disconnect === 'function') {
                                            await a.disconnect()
                                            logger.info('适配器已断开')
                                        }
                                    } catch (err) {
                                        logger.warn('断开适配器时出错', err)
                                    }
                                }
                                // 恢复 stdin 状态，允许进程在断开后退出
                                try {
                                    if (process.stdin && typeof process.stdin.pause === 'function') {
                                        process.stdin.pause()
                                    }
                                } catch (e) {
                                    // ignore
                                }

                                resolve()
                            }

                            // 将全局 shutdown 指向当前做法，供外部 process handler 使用
                            performGlobalShutdown = doShutdown

                            process.once('SIGINT', () => void doShutdown())
                            process.once('SIGTERM', () => void doShutdown())
                        })

                        await shutdownPromise

                        logger.info('适配器已关闭，进程退出')
                        process.exit(0)
                    }
                }
            } catch (e) {
                logger.error('加载或执行工作流时出错:', e)
                process.exit(1)
            }
        }
    }

    logger.info('Ren Flow Runner 已启动')
}

// 仅在 Node.js 环境且直接运行时启动应用
if (isNode && import.meta.url === `file://${process.argv[1]}`) {
    const logger = new Logger('Main')

    main().catch((error) => {
        logger.error('启动失败:', error)
        process.exit(1)
    })

    // 优雅退出处理：若主流程已注册全局 shutdown，委托给它执行；否则直接退出
    process.on('SIGINT', () => {
        logger.info('接收到退出信号，正在关闭...')
        if (typeof performGlobalShutdown === 'function') {
            void performGlobalShutdown().then(() => process.exit(0))
        } else {
            process.exit(0)
        }
    })

    process.on('SIGTERM', () => {
        logger.info('接收到终止信号，正在关闭...')
        if (typeof performGlobalShutdown === 'function') {
            void performGlobalShutdown().then(() => process.exit(0))
        } else {
            process.exit(0)
        }
    })
}

// 导出模块供其他项目使用
export { Logger, LogLevel } from './utils/logger'
export * from './nodes/index'
export * from './workflow/index'
export * from './connectors/adapter/msgTypes'
export { connectorManager } from './connectors/index'

/**
 * 全局初始化入口。
 *
 * 在宿主应用启动时调用，用于设置全局日志级别和其他将来需要的全局初始化逻辑。
 * 返回节点管理器单例以便应用直接使用。
 */
export function init(logLevel?: LogLevel, externalLogger?: {
    debug: (moduleName: string, ...args: any[]) => void
    info: (moduleName: string, ...args: any[]) => void
    warn: (moduleName: string, ...args: any[]) => void
    error: (moduleName: string, ...args: any[]) => void
}) {
    if (externalLogger !== undefined) {
        try {
            Logger.setExternalLogger(externalLogger)
        } catch (e) {
            // ignore
        }
    }

    if (logLevel !== undefined) {
        // 设置 Logger 的全局日志级别
        Logger.setLogLevel(logLevel)
        // 同步设置 nodeManager 的日志级别
        try {
            nodeManager.setLogLevel(logLevel)
        } catch (e) {
            // ignore
        }
    }

    return nodeManager
}
