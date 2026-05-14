import { fillTextTemplate, } from '../../utils/node.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'
import { renderHtmlToImage } from './rendering/htmlImageRenderer.js'

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
            },
            {
                key: 'html',
                label: 'HTML',
                type: 'string',
                description: '最终渲染使用的 HTML 内容'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const tpl = params.template ?? params?.template ?? this.metadata.params[0].defaultValue

        let html = String(tpl || '')

        html = fillTextTemplate(html, input, context)
        try {
            const image = await renderHtmlToImage(html)
            return { success: true, output: { image, html } }
        } catch (err) {
            const msg = (err instanceof Error ? err.message : String(err)) || ''
            const g = (globalThis as any)
            const isBrowser = !!(g && g.document && g.window)
            const prefix = isBrowser ? '浏览器端渲染失败' : '服务器端渲染失败（请确保已安装 puppeteer）'
            return { success: false, error: `${prefix}：${msg}` }
        }
    }
}
