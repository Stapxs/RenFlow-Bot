import { fillTextTemplate, } from '../../utils/node.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

/**
 * 将 HTML 模板渲染为图片节点
 */
export class HtmlRenderNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'html-render',
        name: '图片生成',
        description: '根据模板生成 HTML 并尝试渲染为图片',
        fullDescription: '根据模板生成 HTML 并尝试渲染为图片，HTML 允许使用本软件的部分内置样式。',
        category: 'output',
        icon: 'file-code',
        settingsComponent: 'HtmlRenderSettings',
        params: [
            {
                key: 'settings',
                label: '',
                type: 'settings'
            }
        ],
        outputSchema: [
            {
                key: 'image',
                label: '图片',
                type: 'string',
                description: '渲染后的图片，DataURL（data:image/png;base64,...）'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const resourceWaitTimeoutMs = 10000
        const tpl = params.template ?? params?.template ?? this.metadata.params[0].defaultValue

        let html = String(tpl || '')

        html = fillTextTemplate(html, input, context)

        const g = (globalThis as any)
        const isBrowser = !!(g && g.document && g.window)

        const tryHtml2Canvas = async (htmlStr: string): Promise<string> => {
            const mod = await import('html2canvas')
            const html2canvas = (mod && (mod.default || mod)) as any
            const document = g.document as any
            const container = document.createElement('div')
            container.style.width = 'fit-content'
            container.innerHTML = htmlStr
            document.body.appendChild(container)
            await this.waitForContainerResources(container, g, resourceWaitTimeoutMs)
            const canvas = await html2canvas(container, {
                backgroundColor: null,
                useCORS: true,
                imageTimeout: resourceWaitTimeoutMs
            })
            const dataUrl = canvas.toDataURL('image/png')
            document.body.removeChild(container)
            return dataUrl.replace('data:image/png;base64,', 'base64://')
        }

        if (isBrowser) {
            try {
                const dataUrl = await tryHtml2Canvas(html)
                return { success: true, output: { image: dataUrl } }
            } catch (err) {
                const msg = (err instanceof Error ? err.message : String(err)) || ''
                return { success: false, error: `浏览器端渲染失败：${msg}` }
            }
        } else {
            // Node.js 环境：使用 puppeteer
            try {
                // 动态导入 puppeteer，避免在前端打包时解析模块
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const puppeteerImport = await import(/* @vite-ignore */ 'puppeteer')
                const puppeteer = puppeteerImport.default || puppeteerImport
                const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
                const page = await browser.newPage()
                await page.setContent(html, { waitUntil: 'networkidle0' })
                const buffer = await page.screenshot({ type: 'png', fullPage: false })
                await browser.close()

                const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any)
                const base64 = buf.toString('base64')
                return { success: true, output: { image: `data:image/png;base64,${base64}` } }
            } catch (err) {
                const msg = (err instanceof Error ? err.message : String(err)) || ''
                return { success: false, error: `服务器端渲染失败（请确保已安装 puppeteer）：${msg}` }
            }
        }
    }

    private async waitForContainerResources(container: any, g: any, timeoutMs: number): Promise<void> {
        const pending: Promise<void>[] = []

        if (g.document?.fonts?.ready) {
            pending.push(g.document.fonts.ready.then(() => undefined).catch(() => undefined))
        }

        const images = Array.from(container.querySelectorAll('img')) as any[]
        for (const img of images) {
            this.prepareImageForCanvas(img, g)

            if (img.complete && img.naturalWidth > 0) {
                continue
            }

            pending.push(new Promise((resolve) => {
                const done = () => {
                    img.removeEventListener('load', done)
                    img.removeEventListener('error', done)
                    resolve()
                }

                img.addEventListener('load', done, { once: true })
                img.addEventListener('error', done, { once: true })
            }))
        }

        if (pending.length > 0) {
            await Promise.race([
                Promise.all(pending).then(() => undefined),
                new Promise<void>((resolve) => {
                    setTimeout(resolve, timeoutMs)
                })
            ])
        }
    }

    private prepareImageForCanvas(img: any, g: any): void {
        const src = typeof img?.getAttribute === 'function' ? img.getAttribute('src') || '' : ''
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
            return
        }

        try {
            const url = new URL(src, g.window?.location?.href)
            if (url.origin !== g.window?.location?.origin && !img.crossOrigin) {
                img.crossOrigin = 'anonymous'
                if (img.src !== url.href) {
                    img.src = url.href
                }
            }
        } catch {
            // 忽略非法 URL，交给 html2canvas 自行处理
        }
    }
}
