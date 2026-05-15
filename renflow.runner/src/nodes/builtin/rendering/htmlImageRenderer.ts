const RESOURCE_WAIT_TIMEOUT_MS = 10000

type PuppeteerLike = {
    chromium: {
        launch: (options?: Record<string, any>) => Promise<{
            newPage: () => Promise<{
                setViewportSize?: (viewport: { width: number; height: number }) => Promise<void>
                setContent: (html: string, options?: Record<string, any>) => Promise<void>
                screenshot: (options?: Record<string, any>) => Promise<Uint8Array | Buffer>
            }>
            close: () => Promise<void>
        }>
    }
}

type PlaywrightLike = PuppeteerLike

type BrowserInstance = Awaited<ReturnType<PlaywrightLike['chromium']['launch']>>

export interface HtmlImageRenderOptions {
    width?: number
    transparentBackground?: boolean
    browserViewportHeight?: number
}

async function loadPlaywright(globalObject: any): Promise<PlaywrightLike> {
    const injectedLoader = globalObject?.__renflowLoadPlaywright || globalObject?.__renflowLoadPuppeteer
    if (typeof injectedLoader === 'function') {
        const loaded = await injectedLoader()
        return loaded?.default || loaded
    }

    const runtimeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>
    const playwrightImport = await runtimeImport('playwright')
    return playwrightImport.default || playwrightImport
}

async function launchChromium(playwright: PlaywrightLike): Promise<BrowserInstance> {
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

function normalizeWidth(width?: number): number {
    if (typeof width !== 'number' || Number.isNaN(width) || width <= 0) {
        return 800
    }

    return Math.max(320, Math.floor(width))
}

function normalizeViewportHeight(height?: number): number {
    if (typeof height !== 'number' || Number.isNaN(height) || height <= 0) {
        return 1200
    }

    return Math.max(400, Math.floor(height))
}

export async function renderHtmlToImage(
    html: string,
    options: HtmlImageRenderOptions = {}
): Promise<string> {
    const g = globalThis as any
    const isBrowser = !!(g && g.document && g.window)

    if (isBrowser) {
        return await renderHtmlToImageInBrowser(html, options, g)
    }

    return await renderHtmlToImageInNode(html, options, g)
}

async function renderHtmlToImageInBrowser(
    html: string,
    options: HtmlImageRenderOptions,
    g: any
): Promise<string> {
    const mod = await import('html2canvas')
    const html2canvas = (mod && (mod.default || mod)) as any
    const document = g.document as any
    const container = document.createElement('div')
    const width = normalizeWidth(options.width)
    const transparentBackground = !!options.transparentBackground

    container.style.position = 'fixed'
    container.style.left = '-100000px'
    container.style.top = '0'
    container.style.width = `${width}px`
    container.style.boxSizing = 'border-box'
    container.style.pointerEvents = 'none'
    container.style.zIndex = '-1'
    container.innerHTML = html
    document.body.appendChild(container)

    try {
        await waitForContainerResources(container, g, RESOURCE_WAIT_TIMEOUT_MS)
        const canvas = await html2canvas(container, {
            backgroundColor: transparentBackground ? null : '#ffffff',
            useCORS: true,
            imageTimeout: RESOURCE_WAIT_TIMEOUT_MS,
            width,
            windowWidth: width
        })
        return canvas.toDataURL('image/png')
    } finally {
        if (container.parentNode) {
            container.parentNode.removeChild(container)
        }
    }
}

async function renderHtmlToImageInNode(
    html: string,
    options: HtmlImageRenderOptions,
    g: any
): Promise<string> {
    const width = normalizeWidth(options.width)
    const viewportHeight = normalizeViewportHeight(options.browserViewportHeight)
    const playwright = await loadPlaywright(g)
    const browser = await launchChromium(playwright)

    try {
        const page = await browser.newPage()
        if (typeof page.setViewportSize === 'function') {
            await page.setViewportSize({ width, height: viewportHeight })
        }
        await page.setContent(html, { waitUntil: 'networkidle0' })
        const buffer = await page.screenshot({
            type: 'png',
            fullPage: true,
            omitBackground: !!options.transparentBackground
        })
        const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
        return `data:image/png;base64,${buf.toString('base64')}`
    } finally {
        await browser.close()
    }
}

async function waitForContainerResources(container: any, g: any, timeoutMs: number): Promise<void> {
    const pending: Promise<void>[] = []

    if (g.document?.fonts?.ready) {
        pending.push(g.document.fonts.ready.then(() => undefined).catch(() => undefined))
    }

    const images = Array.from(container.querySelectorAll('img')) as Array<any>
    for (const img of images) {
        prepareImageForCanvas(img, g)

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

function prepareImageForCanvas(img: any, g: any): void {
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
        // 忽略非法 URL，交给渲染器自行处理
    }
}
