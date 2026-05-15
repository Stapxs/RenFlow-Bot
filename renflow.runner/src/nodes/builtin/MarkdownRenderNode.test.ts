import test from 'node:test'
import assert from 'node:assert/strict'

import { MarkdownRenderNode } from './MarkdownRenderNode.js'
import { renderMarkdownDocument } from './rendering/markdownRenderer.js'

function createContext() {
    return {
        nodeId: 'node-1',
        nodeType: 'markdown-render',
        globalState: new Map(),
        logger: {
            log: () => {},
            warn: () => {},
            error: () => {}
        }
    }
}

test('renderMarkdownDocument generates stable GFM HTML structure', () => {
    const rendered = renderMarkdownDocument({
        markdown: [
            '# Heading',
            '',
            '| A | B |',
            '| - | - |',
            '| 1 | 2 |',
            '',
            '- [x] done',
            '- [ ] todo',
            '',
            '```ts',
            'const x = 1',
            '```'
        ].join('\n')
    })

    assert.match(rendered.html, /class="rf-md-table-wrap"/)
    assert.match(rendered.html, /class="rf-md-task"/)
    assert.match(rendered.html, /class="rf-md-code-block"/)
    assert.doesNotMatch(rendered.html, /<script/i)
})

test('MarkdownRenderNode renders markdown with template variables and returns html/image', async () => {
    const originalLoader = (globalThis as any).__renflowLoadPlaywright
    ;(globalThis as any).__renflowLoadPlaywright = async () => ({
        chromium: {
            launch: async () => ({
            newPage: async () => ({
                setViewportSize: async () => {},
                setContent: async () => {},
                screenshot: async () => Buffer.from('png-bytes')
            }),
            close: async () => {}
            })
        }
    })

    try {
        const node = new MarkdownRenderNode()
        const context = createContext()
        const result = await node.execute({
            body: 'Hello **RenFlow**'
        }, {
            markdown: '## {body}\n\n- [x] shipped',
            width: 720
        }, context as any)

        assert.equal(result.success, true)
        assert.match(result.output.image, /^data:image\/png;base64,/)
        assert.match(result.output.html, /<strong>RenFlow<\/strong>/)
        assert.match(result.output.html, /checkbox/)
    } finally {
        ;(globalThis as any).__renflowLoadPlaywright = originalLoader
    }
})

test('MarkdownRenderNode reports clear error when playwright is unavailable', async () => {
    const originalLoader = (globalThis as any).__renflowLoadPlaywright
    ;(globalThis as any).__renflowLoadPlaywright = async () => {
        throw new Error('Cannot find package playwright')
    }

    try {
        const node = new MarkdownRenderNode()
        const result = await node.execute({}, {
            markdown: '# test'
        }, createContext() as any)

        assert.equal(result.success, false)
        assert.match(result.error || '', /请确保已安装 playwright/)
        assert.match(result.error || '', /Cannot find package playwright/)
    } finally {
        ;(globalThis as any).__renflowLoadPlaywright = originalLoader
    }
})

test('MarkdownRenderNode metadata exposes image/html outputs', () => {
    const node = new MarkdownRenderNode()

    assert.equal(node.metadata.id, 'markdown-render')
    assert.equal(node.metadata.name, 'Markdown 渲染')
    assert.deepEqual(node.metadata.outputSchema?.map(item => item.key), ['image', 'html'])
    assert.equal(node.metadata.params.some(item => item.key === 'title'), false)
})
