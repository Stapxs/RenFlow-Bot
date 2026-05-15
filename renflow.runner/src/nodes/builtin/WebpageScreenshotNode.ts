import { fillTextTemplate } from '../../utils/node.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeContext, NodeExecutionResult, NodeMetadata } from '../types.js'
import { captureWebpageScreenshot } from './rendering/webpageScreenshotRenderer.js'

export class WebpageScreenshotNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'webpage-screenshot',
        name: '网页截图',
        description: '打开网页并生成截图',
        fullDescription: '输入一个网页 URL，尝试加载页面并输出截图图片、页面标题和最终 HTML。桌面 runner 会优先使用真实浏览器截图。',
        category: 'output',
        icon: 'camera',
        params: [
            {
                key: 'url',
                label: '网页地址',
                type: 'input',
                required: true,
                dynamic: true,
                placeholder: 'https://example.com'
            },
            {
                key: 'width',
                label: '截图宽度',
                type: 'number',
                defaultValue: 1280,
                placeholder: '默认 1280'
            },
            {
                key: 'height',
                label: '截图高度',
                type: 'number',
                defaultValue: 960,
                placeholder: '默认 960',
                visibleWhen: { key: 'selector', value: '' }
            },
            {
                key: 'selector',
                label: '目标元素',
                type: 'input',
                dynamic: true,
                defaultValue: '',
                placeholder: '#id 或 .class 或任意 CSS 选择器'
            },
            {
                key: 'injectCss',
                label: '额外 CSS',
                type: 'textarea',
                dynamic: true,
                defaultValue: '',
                placeholder: '例如：header,.ads{display:none!important;}'
            },
            {
                key: 'injectJs',
                label: '额外 JS',
                type: 'textarea',
                dynamic: true,
                defaultValue: '',
                placeholder: '例如：document.querySelector(\"header\")?.remove()'
            },
            {
                key: 'fullPage',
                label: '整页截图',
                type: 'switch',
                defaultValue: true,
                visibleWhen: { key: 'selector', value: '' }
            },
            {
                key: 'waitTimeMs',
                label: '额外等待(ms)',
                type: 'number',
                defaultValue: 800,
                placeholder: '等待页面动态内容稳定'
            },
            {
                key: 'timeoutMs',
                label: '超时(ms)',
                type: 'number',
                defaultValue: 15000,
                placeholder: '默认 15000'
            }
        ],
        outputSchema: [
            {
                key: 'image',
                label: '截图图片',
                type: 'string',
                description: '网页截图图片，DataURL（data:image/png;base64,...）'
            },
            {
                key: 'title',
                label: '页面标题',
                type: 'string',
                description: '页面 title'
            },
            {
                key: 'html',
                label: '页面 HTML',
                type: 'string',
                description: '截图时采集到的 HTML'
            },
            {
                key: 'captureMode',
                label: '截图模式',
                type: 'string',
                description: 'node-live 或 browser-static'
            },
            {
                key: 'url',
                label: '最终地址',
                type: 'string',
                description: '截图实际访问的页面地址'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        let url = ''
        let selector = ''
        let injectCss = ''
        let injectJs = ''
        try {
            url = String(fillTextTemplate(String(params.url || ''), input, context, true) || '').trim()
            selector = String(fillTextTemplate(String(params.selector || ''), input, context, true) || '').trim()
            injectCss = String(params.injectCss || '')
            injectJs = String(params.injectJs || '')
        } catch (error) {
            return {
                success: false,
                error: `网页截图参数模板解析失败: ${(error as Error)?.message || String(error)}`
            }
        }

        if (!url) {
            return {
                success: false,
                error: '网页地址不能为空'
            }
        }

        const g = globalThis as any
        const isBrowser = !!(g && g.document && g.window)

        if (isBrowser) {
            context.logger?.warn?.('当前运行环境不支持网页截图，已跳过该步骤')
            return {
                success: true,
                output: {
                    image: '',
                    title: '',
                    html: '',
                    captureMode: 'unsupported-tauri-webview',
                    url
                }
            }
        }

        try {
            const result = await captureWebpageScreenshot(url, {
                width: Number(params.width || 1280),
                height: Number(params.height || 960),
                selector,
                injectCss,
                injectJs,
                fullPage: params.fullPage !== false,
                waitTimeMs: Number(params.waitTimeMs || 800),
                timeoutMs: Number(params.timeoutMs || 15000),
                proxyPort: context.globalState?.get('__tauriProxyPort')
            })

            return {
                success: true,
                output: result
            }
        } catch (error) {
            const message = (error instanceof Error ? error.message : String(error)) || ''
            const prefix = isBrowser ? '浏览器端网页截图失败' : '服务器端网页截图失败（请确保已安装 playwright）'
            return {
                success: false,
                error: `${prefix}：${message}`
            }
        }
    }
}
