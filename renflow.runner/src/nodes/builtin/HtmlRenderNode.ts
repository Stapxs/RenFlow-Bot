import { getGlobal } from '../../utils/node.js'
import { getValue } from '../../utils/util.js'
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
        _input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const tpl = params.template ?? params?.template ?? this.metadata.params[0].defaultValue

        let html = String(tpl || '')

        if (html.includes('{') && html.includes('}')) {
            const regex = /\{([^}]+)\}/g
            let match
            while ((match = regex.exec(html)) !== null) {
                const placeholder = match[0]
                const path = match[1].split('.')
                const nodeId = path[0]
                const nodeData = getGlobal(context, nodeId)
                const value = getValue(nodeData, path.slice(1).join('.'))
                if (value !== undefined) {
                    html = html.replace(placeholder, String(value))
                }
            }
        }

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
            const canvas = await html2canvas(container, { backgroundColor: null })
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
}
