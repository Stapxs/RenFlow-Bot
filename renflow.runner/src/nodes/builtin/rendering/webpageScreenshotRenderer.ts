import { renderHtmlToImage } from './htmlImageRenderer.js'

type PuppeteerLike = {
    chromium: {
        launch: (options?: Record<string, any>) => Promise<{
            newPage: () => Promise<{
                setViewportSize?: (viewport: { width: number; height: number }) => Promise<void>
                goto?: (url: string, options?: Record<string, any>) => Promise<any>
                addStyleTag?: (options?: Record<string, any>) => Promise<any>
                evaluate?: (pageFunction: string | ((...args: any[]) => any), ...args: any[]) => Promise<any>
                screenshot: (options?: Record<string, any>) => Promise<Uint8Array | Buffer>
                locator?: (selector: string) => {
                    first: () => {
                        waitFor?: (options?: Record<string, any>) => Promise<void>
                        screenshot: (options?: Record<string, any>) => Promise<Uint8Array | Buffer>
                    }
                }
                title?: () => Promise<string>
                content?: () => Promise<string>
                url?: () => string
            }>
            close: () => Promise<void>
        }>
    }
}

type BrowserInstance = Awaited<ReturnType<PuppeteerLike['chromium']['launch']>>

export interface WebpageScreenshotOptions {
    width?: number
    height?: number
    selector?: string
    injectCss?: string
    injectJs?: string
    fullPage?: boolean
    waitTimeMs?: number
    timeoutMs?: number
    proxyPort?: number
}

export interface WebpageScreenshotResult {
    image: string
    title: string
    html: string
    captureMode: 'node-live' | 'browser-static'
    url: string
}

function normalizeWidth(width?: number): number {
    if (typeof width !== 'number' || Number.isNaN(width) || width <= 0) {
        return 1280
    }
    return Math.max(320, Math.floor(width))
}

function normalizeHeight(height?: number): number {
    if (typeof height !== 'number' || Number.isNaN(height) || height <= 0) {
        return 960
    }
    return Math.max(240, Math.floor(height))
}

function normalizeTimeout(timeoutMs?: number): number {
    if (typeof timeoutMs !== 'number' || Number.isNaN(timeoutMs) || timeoutMs <= 0) {
        return 15000
    }
    return Math.max(1000, Math.floor(timeoutMs))
}

function normalizeWaitTime(waitTimeMs?: number): number {
    if (typeof waitTimeMs !== 'number' || Number.isNaN(waitTimeMs) || waitTimeMs < 0) {
        return 800
    }
    return Math.floor(waitTimeMs)
}

function normalizeSelector(selector?: string): string {
    if (typeof selector !== 'string') {
        return ''
    }
    return selector.trim()
}

function normalizeText(value?: string): string {
    if (typeof value !== 'string') {
        return ''
    }
    return value.trim()
}

function rewriteUrlForProxy(url: string, proxyPort?: number): string {
    if (!proxyPort) return url

    try {
        const parsed = new URL(url)
        const scheme = parsed.protocol.replace(':', '')
        return `http://127.0.0.1:${proxyPort}/relay/${scheme}/${parsed.host}${parsed.pathname}${parsed.search}`
    } catch {
        return url
    }
}

async function loadPlaywright(globalObject: any): Promise<PuppeteerLike> {
    const injectedLoader = globalObject?.__renflowLoadPlaywright || globalObject?.__renflowLoadPuppeteer
    if (typeof injectedLoader === 'function') {
        const loaded = await injectedLoader()
        return loaded?.default || loaded
    }

    const runtimeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>
    const playwrightImport = await runtimeImport('playwright')
    return playwrightImport.default || playwrightImport
}

async function launchChromium(playwright: PuppeteerLike): Promise<BrowserInstance> {
    const candidates = [
        undefined,
        'chrome',
        'msedge'
    ]

    let lastError: any
    for (const channel of candidates) {
        try {
            return await playwright.chromium.launch({
                channel,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            })
        } catch (error) {
            lastError = error
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError || '启动 Chromium 失败'))
}

function extractTitleFromHtml(doc: any): string {
    return String(doc.querySelector('title')?.textContent || '').trim()
}

function rewriteBrowserDocumentUrls(doc: any, baseUrl: string, proxyPort?: number): void {
    const base = doc.querySelector('base') || doc.createElement('base')
    base.setAttribute('href', rewriteUrlForProxy(baseUrl, proxyPort))
    if (!base.parentNode) {
        if (doc.head) {
            doc.head.prepend(base)
        } else if (doc.documentElement) {
            doc.documentElement.prepend(base)
        }
    }

    doc.querySelectorAll('script').forEach((node: any) => node.remove())

    const rewriteAttribute = (selector: string, attribute: string) => {
        doc.querySelectorAll(selector).forEach((element: any) => {
            const raw = element.getAttribute(attribute)
            if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('#') || raw.startsWith('javascript:')) {
                return
            }
            try {
                const absolute = new URL(raw, baseUrl).toString()
                element.setAttribute(attribute, rewriteUrlForProxy(absolute, proxyPort))
            } catch {
                // ignore invalid URLs
            }
        })
    }

    rewriteAttribute('[src]', 'src')
    rewriteAttribute('[href]', 'href')
    rewriteAttribute('[poster]', 'poster')

    doc.querySelectorAll('img').forEach((img: any) => {
        img.setAttribute('crossorigin', 'anonymous')
    })
}

async function captureInBrowser(url: string, options: WebpageScreenshotOptions): Promise<WebpageScreenshotResult> {
    const width = normalizeWidth(options.width)
    const timeoutMs = normalizeTimeout(options.timeoutMs)
    const proxiedUrl = rewriteUrlForProxy(url, options.proxyPort)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(proxiedUrl, {
            signal: controller.signal
        })
        if (!response.ok) {
            throw new Error(`网页加载失败: HTTP ${response.status}`)
        }

        const htmlText = await response.text()
        const parser = new (globalThis as any).DOMParser()
        const doc = parser.parseFromString(htmlText, 'text/html')
        rewriteBrowserDocumentUrls(doc, response.url || proxiedUrl, options.proxyPort)
        const title = extractTitleFromHtml(doc)
        const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
        const image = await renderHtmlToImage(html, { width })

        return {
            image,
            title,
            html,
            captureMode: 'browser-static',
            url
        }
    } finally {
        clearTimeout(timer)
    }
}

async function captureInNode(url: string, options: WebpageScreenshotOptions): Promise<WebpageScreenshotResult> {
    const width = normalizeWidth(options.width)
    const height = normalizeHeight(options.height)
    const timeoutMs = normalizeTimeout(options.timeoutMs)
    const waitTimeMs = normalizeWaitTime(options.waitTimeMs)
    const selector = normalizeSelector(options.selector)
    const injectCss = normalizeText(options.injectCss)
    const injectJs = normalizeText(options.injectJs)
    const fullPage = options.fullPage !== false
    const playwright = await loadPlaywright(globalThis as any)
    const browser = await launchChromium(playwright)

    try {
        const page = await browser.newPage()
        if (typeof page.setViewportSize === 'function') {
            await page.setViewportSize({ width, height })
        }
        if (typeof page.goto !== 'function') {
            throw new Error('当前 Puppeteer 运行时不支持 page.goto')
        }

        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: timeoutMs
        })

        if (injectCss) {
            if (typeof page.addStyleTag !== 'function') {
                throw new Error('当前 Playwright 运行时不支持注入 CSS')
            }
            await page.addStyleTag({
                content: injectCss
            })
        }

        if (injectJs) {
            if (typeof page.evaluate !== 'function') {
                throw new Error('当前 Playwright 运行时不支持注入 JS')
            }
            await page.evaluate(injectJs)
        }

        if (waitTimeMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTimeMs))
        }

        let buffer: Uint8Array | Buffer
        if (selector) {
            if (typeof page.locator !== 'function') {
                throw new Error('当前 Playwright 运行时不支持元素定位截图')
            }
            const locator = page.locator(selector).first()
            if (!locator || typeof locator.screenshot !== 'function') {
                throw new Error(`未找到目标元素: ${selector}`)
            }
            if (typeof locator.waitFor === 'function') {
                try {
                    await locator.waitFor({
                        state: 'visible',
                        timeout: timeoutMs
                    })
                } catch (_error) {
                    throw new Error(`未找到目标元素: ${selector}`)
                }
            }
            buffer = await locator.screenshot({
                type: 'png'
            })
        } else {
            buffer = await page.screenshot({
                type: 'png',
                fullPage
            })
        }
        const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)

        return {
            image: `data:image/png;base64,${buf.toString('base64')}`,
            title: typeof page.title === 'function' ? await page.title() : '',
            html: typeof page.content === 'function' ? await page.content() : '',
            captureMode: 'node-live',
            url: typeof page.url === 'function' ? page.url() : url
        }
    } finally {
        await browser.close()
    }
}

export async function captureWebpageScreenshot(
    url: string,
    options: WebpageScreenshotOptions = {}
): Promise<WebpageScreenshotResult> {
    const g = globalThis as any
    const isBrowser = !!(g && g.document && g.window)

    if (isBrowser) {
        return await captureInBrowser(url, options)
    }

    return await captureInNode(url, options)
}
