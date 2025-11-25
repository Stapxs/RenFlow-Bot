import { Logger } from '../../utils/logger.js'
import { fillTextTemplate } from '../../utils/node.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'

/**
 * 简单的 HTTP 请求节点，基于全局 fetch（Node >=18 / 浏览器）
 */
export class HttpRequestNode extends BaseNode {

    logger = new Logger('HttpRequestNode')

    metadata: NodeMetadata = {
        id: 'http-request',
        name: 'HTTP 请求',
        description: '发起 HTTP/HTTPS 请求并返回响应',
        category: 'network',
        icon: 'link',
        params: [
            { pin: true, key: 'method', label: '方法', type: 'select', defaultValue: 'GET', options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }, { label: 'PUT', value: 'PUT' }, { label: 'DELETE', value: 'DELETE' }] },
            { pin: true, key: 'url', label: 'URL', type: 'input', placeholder: 'https://api.example.com/data', required: true, dynamic: true },
            { key: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Content-Type":"application/json"}', defaultValue: '{}' },
            { key: 'query', label: 'Query Params (JSON)', type: 'textarea', placeholder: '{"q":"keyword"}', defaultValue: '{}' },
            { key: 'body', label: 'Body (string or JSON)', type: 'textarea', placeholder: '请求体（可为 JSON）' },
            { key: 'timeout', label: '超时(ms)', type: 'number', defaultValue: 10000 },
            { key: 'retries', label: '重试次数', type: 'number', defaultValue: 0 },
            { key: 'responseType', label: '响应类型', type: 'select', defaultValue: 'json', options: [{ label: 'json', value: 'json' }, { label: 'text', value: 'text' }] }
        ],
        outputSchema: [
            { key: 'status', label: 'HTTP 状态码', type: 'number' },
            { key: 'headers', label: '响应头', type: 'object' },
            { key: 'body', label: '响应体', type: 'any' },
            { key: 'duration', label: '耗时(ms)', type: 'number' }
        ]
    }

    private buildUrlWithQuery(url: string, queryObj: Record<string, any>): string {
        try {
            const u = new URL(url)
            for (const k of Object.keys(queryObj || {})) {
                const v = queryObj[k]
                if (v === undefined || v === null) continue
                if (Array.isArray(v)) {
                    for (const item of v) u.searchParams.append(k, String(item))
                } else {
                    u.searchParams.set(k, String(v))
                }
            }
            return u.toString()
        } catch (e) {
            // 如果不是完整 URL，尝试直接拼接查询字符串
            const qs = Object.keys(queryObj || {})
                .filter(k => queryObj[k] !== undefined && queryObj[k] !== null)
                .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(queryObj[k]))}`)
                .join('&')
            return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url
        }
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext): Promise<NodeExecutionResult> {
        const method = (params.method || 'GET').toUpperCase()
        let rawUrl: string
        try {
            rawUrl = fillTextTemplate(params.url, input, context, true)
        } catch (e) {
            return { success: false, error: `URL 模板解析失败: ${(e as unknown as Error).message || String(e)}` }
        }
        if (!rawUrl) return { success: false, error: '缺少 url 参数' }

        let headers: Record<string, string> = {}
        try {
            const h = params.headers || '{}'
            headers = typeof h === 'string' ? JSON.parse(h || '{}') : h
        } catch (e) {
            return { success: false, error: 'headers 参数不是合法的 JSON' }
        }

        let queryObj: Record<string, any> = {}
        try {
            const q = params.query || '{}'
            queryObj = typeof q === 'string' ? JSON.parse(q || '{}') : q
        } catch (e) {
            return { success: false, error: 'query 参数不是合法的 JSON' }
        }

        const url = this.buildUrlWithQuery(rawUrl, queryObj)

        // body
        let body: any = undefined
        if (params.body !== undefined && params.body !== null && params.body !== '') {
            if (typeof params.body === 'string') {
                // 尝试解析为 JSON，否则当作文本
                try {
                    body = JSON.parse(params.body)
                } catch {
                    body = params.body
                }
            } else {
                body = params.body
            }
        }

        const timeout = Number(params.timeout || 10000)
        const retries = Math.max(0, Number(params.retries || 0))
        const responseType = params.responseType || 'json'

        const start = Date.now()
        for (let attempt = 1; attempt <= retries + 1; attempt++) {
            // log attempt
            if (context && context.logger && typeof context.logger.log === 'function') {
                context.logger.log(`HttpRequestNode attempt ${attempt} ${method} ${url}`)
            }
            const ac = new AbortController()
            const timer = setTimeout(() => ac.abort(), timeout)
            try {
                const fetchOptions: any = { method, headers, signal: ac.signal }
                if (body !== undefined) {
                    if (typeof body === 'object' && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array)) {
                        // 如果未设置 Content-Type，则默认 application/json
                        if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
                            fetchOptions.headers = { ...(fetchOptions.headers || {}), 'Content-Type': 'application/json' }
                        }
                        fetchOptions.body = JSON.stringify(body)
                    } else {
                        fetchOptions.body = body
                    }
                }

                // 使用全局 fetch（Node 18+ 或浏览器）
                // @ts-ignore runtime global
                const res = await (globalThis as any).fetch(url, fetchOptions)
                clearTimeout(timer)

                const headersObj: Record<string, string> = {}
                res.headers?.forEach((v: string, k: string) => (headersObj[k] = v))

                let parsed: any = null
                try {
                    // 先读取为文本，避免多次消费 body 导致的 locked 错误
                    const text = await res.text()

                    if (responseType === 'json') {
                        try {
                            parsed = text ? JSON.parse(text) : null
                        } catch (e) {
                            // 解析失败则回退为原始文本
                            parsed = text
                        }
                    } else {
                        parsed = text
                    }
                } catch (ex) {
                    return {
                        success: false,
                        error: `响应解析失败: ${(ex as unknown as Error).message || String(ex)}`
                    }
                }

                const duration = Date.now() - start
                return {
                    success: true,
                    output: {
                        status: res.status,
                        headers: headersObj,
                        body: parsed,
                        duration
                    }
                }
            } catch (err: any) {
                clearTimeout(timer)
                if (attempt <= retries) {
                    await new Promise(r => setTimeout(r, 200 * attempt))
                    continue
                }

                const duration = Date.now() - start
                return {
                    success: false,
                    error: `请求失败: ${err?.message || String(err)}`,
                    output: {
                        status: null,
                        headers: {},
                        body: null,
                        duration
                    }
                }
            }
        }

        return { success: false, error: '请求失败: 未知错误' }
    }
}

export default HttpRequestNode
