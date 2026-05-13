import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core'
import { Logger, LogType } from '@app/functions/base'
import { toast } from '@app/functions/toast'
import { reactive } from 'vue'

const logger = new Logger()

export const backend = reactive({
    type: 'web' as 'tauri' | 'web',
    platform: undefined as 'win32' | 'darwin' | 'linux' | 'web' | undefined,
    release: '',
    arch: '' as string | undefined,
    proxy: undefined as number | undefined,

    function: undefined as {
        invoke: <T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<T>
    },
    listener: undefined as ((event: string, ...args: any[]) => void) | undefined,

    isDesktop() {
        return this.type == 'tauri'
    },
    isWeb() {
        return this.type == 'web'
    },

    /**
     * 代理 URL 转换
     * @param url 需要转换的 URL
     * @returns 转换后的 URL
     */
    proxyUrl(url: string) {
        if (this.proxy && url && url.startsWith('http')) {
            return `http://localhost:${this.proxy}/proxy?url=${encodeURIComponent(url)}`
        } else {
            return url
        }
    },

    /**
     * 初始化后端功能
     *
     * @returns {Promise<void>}
     */
    async init() {
        if (window.__TAURI_INTERNALS__ != undefined) {
            this.type = 'tauri';
            this.function = {
                invoke: (await import('@tauri-apps/api/core')).invoke
            }
            this.listener = (await import('@tauri-apps/api/event')).listen;
        }

        this.platform = await this.call('sys:getPlatform')
        const releaseData = await this.call('sys:getRelease')
        this.release = releaseData?.release || ''
        this.arch = releaseData?.arch || undefined

        if(this.type == 'web' && !this.platform) {
            this.platform = 'web'
        }

        if (!this.release) {
            let os = ''
            let version = ''

            // 优先使用 navigator.userAgentData（Chrome / Edge / Android）
            if ((navigator as any).userAgentData) {
                os = (navigator as any).userAgentData.platform || os
                try {
                    const highEntropy = await (navigator as any).userAgentData.getHighEntropyValues(['platformVersion'])
                    version = highEntropy.platformVersion || version
                } catch (e) {
                    // 如果获取失败，保持 Unknown
                }
            } else {
                // fallback: 使用 navigator.userAgent
                const ua = navigator.userAgent

                if (/Windows NT (\d+\.\d+)/.test(ua)) {
                    os = 'Windows'
                    version = ua.match(/Windows NT (\d+\.\d+)/)?.[1] ?? 'Unknown'
                } else if (/Mac OS X (\d+[_.]\d+[_.]?\d*)/.test(ua)) {
                    os = 'macOS'
                    version = ua.match(/Mac OS X (\d+[_.]\d+[_.]?\d*)/)?.[1]?.replace(/_/g, '.') ?? 'Unknown'
                } else if (/Android (\d+(\.\d+)?)/.test(ua)) {
                    os = 'Android'
                    version = ua.match(/Android (\d+(\.\d+)?)/)?.[1] ?? 'Unknown'
                } else if (/iPhone OS (\d+[_.]\d+[_.]?\d*)/.test(ua)) {
                    os = 'iOS'
                    version = ua.match(/iPhone OS (\d+[_.]\d+[_.]?\d*)/)?.[1]?.replace(/_/g, '.') ?? 'Unknown'
                } else if (/Linux/.test(ua)) {
                    os = 'Linux'
                    version = 'Unknown'
                }
            }
            this.release = `${os} ${version} (Web)`
        }
        this.proxy  = await this.call('sys:runProxy')
        if(this.type == 'tauri' && !this.proxy) {
            logger.error(null, 'Tauri 代理服务似乎没有正常启动，此服务异常将会影响应用内的大部分外部资源的加载。')
            toast.error('Tauri 代理服务似乎没有正常启动')
        }
    },

    /**
     * 调用后端方法
     *
     * #### 方法名称
     * 请使用统一的 sys:getConfig
     * - tauri 将调用 sys_ 前缀加下划线小写的名称如 > sys_get_config
     *
     * #### 备注
     * - 在 tauri 中。args 必须是一个对象，如果你传递了其他类型的参数，此方法会自行转换为 ```{data: args[0]}```; 请在后端获取 data 在进行处理。
     *
     * ---
     *
     * @param name 方法名称
     * @param args 参数列表
     * @returns 返回值
     */
    async call( name: string, ...args: any[]): Promise<any> {
        if (this.function) {
                name = name.replaceAll(':', '_').replace(/([A-Z])/g, '_$1').toLowerCase()
            // 调用对应方法
            try {
                if ('tauri' == this.type && 'invoke' in this.function) {
                    // tauri 这边必须传入一个字典
                    if (args.length == 0) {
                        // 没有参数时传空对象
                        return await this.function.invoke(name, {})
                    } else if (Object.prototype.toString.call(args[0]) !== '[object Object]') {
                        // 如果第一个参数不是对象，包装成 {data: args[0]}
                        return await this.function.invoke(name, { data: args[0] })
                    } else {
                        // 如果第一个参数已经是对象，直接使用
                        return await this.function.invoke(name, args[0])
                    }
                }
            } catch (ex) {
                logger.add(LogType.DEBUG, `调用后端方法 ${name} 失败`, ex)
                return undefined
            }
        }
    },

    /**
     * 添加后端监听，名称统一为 sys: 前缀
     * @param type capacitor：插件类型
     * @param name 事件名称
     * @param callBack 回调函数
     */
    addListener(name: string, callBack: (...args: any[]) => void) {
        if(this.listener) {
            if(this.isDesktop()) {
                this.listener(name, callBack)
                return
            }
        }
        logger.error(null, `添加后端监听失败：${name}`)
    },
})
