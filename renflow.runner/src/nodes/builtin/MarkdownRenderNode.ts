import { fillTextTemplate } from '../../utils/node.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeContext, NodeExecutionResult, NodeMetadata } from '../types.js'
import { renderHtmlToImage } from './rendering/htmlImageRenderer.js'
import { renderMarkdownDocument } from './rendering/markdownRenderer.js'

export class MarkdownRenderNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'markdown-render',
        name: 'Markdown 渲染',
        description: '将 Markdown 渲染为 HTML 并生成图片',
        fullDescription: '支持常用 GFM Markdown，将内容渲染为固定主题卡片，并输出 HTML 和图片。',
        category: 'output',
        icon: 'file-lines',
        params: [
            {
                key: 'markdown',
                label: 'Markdown',
                type: 'textarea',
                required: true,
                dynamic: true,
                placeholder: '输入要渲染的 Markdown 内容'
            },
            {
                key: 'theme',
                label: '主题',
                type: 'select',
                defaultValue: 'default',
                options: [
                    { label: '默认', value: 'default' }
                ]
            },
            {
                key: 'width',
                label: '宽度',
                type: 'number',
                defaultValue: 800,
                placeholder: '默认 800'
            },
            {
                key: 'transparentBackground',
                label: '透明背景',
                type: 'switch',
                defaultValue: false
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
                description: 'Markdown 转换后的完整 HTML 文档'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const markdown = fillTextTemplate(String(params.markdown || ''), input, context)
        const width = typeof params.width === 'number' ? params.width : Number(params.width)
        const transparentBackground = !!params.transparentBackground
        const theme = String(params.theme || 'default')

        const rendered = renderMarkdownDocument({
            markdown,
            width,
            transparentBackground,
            theme
        })

        try {
            const image = await renderHtmlToImage(rendered.html, { width, transparentBackground })
            return {
                success: true,
                output: {
                    image,
                    html: rendered.html
                }
            }
        } catch (err) {
            const msg = (err instanceof Error ? err.message : String(err)) || ''
            const g = (globalThis as any)
            const isBrowser = !!(g && g.document && g.window)
            const prefix = isBrowser ? '浏览器端 Markdown 渲染失败' : '服务器端 Markdown 渲染失败（请确保已安装 playwright）'
            return {
                success: false,
                error: `${prefix}：${msg}`
            }
        }
    }
}
