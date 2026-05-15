import test from 'node:test'
import assert from 'node:assert/strict'

import { WebpageScreenshotNode } from './WebpageScreenshotNode.js'

function createContext(proxyPort?: number) {
    return {
        nodeId: 'node-webshot-1',
        nodeType: 'webpage-screenshot',
        globalState: new Map(proxyPort ? [['__tauriProxyPort', proxyPort]] : []),
        logger: {
            log: () => {},
            warn: () => {},
            error: () => {}
        }
    }
}

test('WebpageScreenshotNode captures page screenshot via injected playwright loader', async () => {
    const node = new WebpageScreenshotNode()
    const originalLoader = (globalThis as any).__renflowLoadPlaywright
    let gotoUrl = ''
    let viewport: { width: number; height: number } | null = null

    ;(globalThis as any).__renflowLoadPlaywright = async () => ({
        chromium: {
            launch: async () => ({
            newPage: async () => ({
                setViewportSize: async (nextViewport: { width: number; height: number }) => {
                    viewport = nextViewport
                },
                goto: async (url: string) => {
                    gotoUrl = url
                },
                screenshot: async () => Buffer.from('png-bytes'),
                title: async () => 'Example Title',
                content: async () => '<html><head><title>Example Title</title></head><body>Hello</body></html>',
                url: () => gotoUrl
            }),
            close: async () => {}
            })
        }
    })

    try {
        const result = await node.execute({}, {
            url: 'https://example.com/page',
            width: 1024,
            height: 720,
            fullPage: true,
            waitTimeMs: 0,
            timeoutMs: 5000
        }, createContext() as any)

        assert.equal(result.success, true)
        assert.equal(gotoUrl, 'https://example.com/page')
        assert.deepEqual(viewport, { width: 1024, height: 720 })
        assert.match(String(result.output.image), /^data:image\/png;base64,/)
        assert.equal(result.output.title, 'Example Title')
        assert.equal(result.output.captureMode, 'node-live')
    } finally {
        ;(globalThis as any).__renflowLoadPlaywright = originalLoader
    }
})

test('WebpageScreenshotNode keeps target URL in node-live mode', async () => {
    const node = new WebpageScreenshotNode()
    const originalLoader = (globalThis as any).__renflowLoadPlaywright
    let gotoUrl = ''

    ;(globalThis as any).__renflowLoadPlaywright = async () => ({
        chromium: {
            launch: async () => ({
            newPage: async () => ({
                setViewportSize: async () => {},
                goto: async (url: string) => {
                    gotoUrl = url
                },
                screenshot: async () => Buffer.from('png-bytes'),
                title: async () => 'Proxy Title',
                content: async () => '<html><body>Proxy</body></html>',
                url: () => gotoUrl
            }),
            close: async () => {}
            })
        }
    })

    try {
        const result = await node.execute({}, {
            url: 'https://example.com/path?q=1',
            waitTimeMs: 0
        }, createContext(6123) as any)

        assert.equal(result.success, true)
        assert.equal(gotoUrl, 'https://example.com/path?q=1')
        assert.equal(result.output.url, 'https://example.com/path?q=1')
    } finally {
        ;(globalThis as any).__renflowLoadPlaywright = originalLoader
    }
})

test('WebpageScreenshotNode captures target element via selector', async () => {
    const node = new WebpageScreenshotNode()
    const originalLoader = (globalThis as any).__renflowLoadPlaywright
    let usedSelector = ''
    let injectedCss = ''
    let injectedJs = ''

    ;(globalThis as any).__renflowLoadPlaywright = async () => ({
        chromium: {
            launch: async () => ({
            newPage: async () => ({
                setViewportSize: async () => {},
                goto: async () => {},
                addStyleTag: async ({ content }: { content: string }) => {
                    injectedCss = content
                },
                evaluate: async (script: string) => {
                    injectedJs = script
                },
                locator: (selector: string) => ({
                    first: () => ({
                        waitFor: async () => {
                            usedSelector = selector
                        },
                        screenshot: async () => Buffer.from('selector-png')
                    })
                }),
                screenshot: async () => Buffer.from('page-png'),
                title: async () => 'Selector Title',
                content: async () => '<div id="target">Hello</div>',
                url: () => 'https://example.com/selector'
            }),
            close: async () => {}
            })
        }
    })

    try {
        const result = await node.execute({}, {
            url: 'https://example.com/selector',
            selector: '#target',
            injectCss: '#target{outline:none}.toolbar{display:none!important}',
            injectJs: 'document.querySelector(".toolbar")?.remove()',
            waitTimeMs: 0
        }, createContext() as any)

        assert.equal(result.success, true)
        assert.equal(usedSelector, '#target')
        assert.equal(injectedCss, '#target{outline:none}.toolbar{display:none!important}')
        assert.equal(injectedJs, 'document.querySelector(".toolbar")?.remove()')
        assert.match(String(result.output.image), /^data:image\/png;base64,/)
        assert.equal(result.output.title, 'Selector Title')
    } finally {
        ;(globalThis as any).__renflowLoadPlaywright = originalLoader
    }
})

test('WebpageScreenshotNode reports missing selector target clearly', async () => {
    const node = new WebpageScreenshotNode()
    const originalLoader = (globalThis as any).__renflowLoadPlaywright

    ;(globalThis as any).__renflowLoadPlaywright = async () => ({
        chromium: {
            launch: async () => ({
            newPage: async () => ({
                setViewportSize: async () => {},
                goto: async () => {},
                locator: () => ({
                    first: () => ({
                        waitFor: async () => {
                            throw new Error('timeout')
                        },
                        screenshot: async () => Buffer.from('selector-png')
                    })
                }),
                screenshot: async () => Buffer.from('page-png'),
                title: async () => 'Missing Selector',
                content: async () => '<div>Hello</div>',
                url: () => 'https://example.com/missing'
            }),
            close: async () => {}
            })
        }
    })

    try {
        const result = await node.execute({}, {
            url: 'https://example.com/missing',
            selector: '.does-not-exist',
            waitTimeMs: 0
        }, createContext() as any)

        assert.equal(result.success, false)
        assert.match(String(result.error), /未找到目标元素: \.does-not-exist/)
    } finally {
        ;(globalThis as any).__renflowLoadPlaywright = originalLoader
    }
})

test('WebpageScreenshotNode metadata exposes screenshot outputs', () => {
    const node = new WebpageScreenshotNode()

    assert.equal(node.metadata.id, 'webpage-screenshot')
    assert.deepEqual(node.metadata.outputSchema?.map(item => item.key), ['image', 'title', 'html', 'captureMode', 'url'])
})

test('WebpageScreenshotNode skips successfully in browser-like environment', async () => {
    const node = new WebpageScreenshotNode()
    const originalWindow = (globalThis as any).window
    const originalDocument = (globalThis as any).document
    const warnings: string[] = []

    ;(globalThis as any).window = {}
    ;(globalThis as any).document = {}

    try {
        const context = createContext() as any
        context.logger.warn = (message: string) => {
            warnings.push(message)
        }

        const result = await node.execute({}, {
            url: 'https://example.com/browser-only'
        }, context)

        assert.equal(result.success, true)
        assert.equal(result.output.captureMode, 'unsupported-tauri-webview')
        assert.equal(result.output.url, 'https://example.com/browser-only')
        assert.equal(result.output.image, '')
        assert.equal(warnings.length, 1)
        assert.match(warnings[0], /不支持网页截图/)
    } finally {
        ;(globalThis as any).window = originalWindow
        ;(globalThis as any).document = originalDocument
    }
})
