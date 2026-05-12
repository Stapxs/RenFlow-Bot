import { z } from 'zod'
import type { AgentTool, AgentToolExecutionContext } from './types.js'

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} 超时(${timeoutMs}ms)`)), timeoutMs)
        promise.then(
            value => {
                clearTimeout(timer)
                resolve(value)
            },
            error => {
                clearTimeout(timer)
                reject(error)
            }
        )
    })
}

async function executeHttpRequest(args: Record<string, any>): Promise<any> {
    const method = String(args.method || 'GET').toUpperCase()
    const headers = (args.headers && typeof args.headers === 'object') ? args.headers : {}
    const query = (args.query && typeof args.query === 'object') ? args.query : {}
    const url = new URL(String(args.url))
    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) continue
        if (Array.isArray(value)) {
            for (const item of value) url.searchParams.append(key, String(item))
        } else {
            url.searchParams.set(key, String(value))
        }
    }

    const requestInit: RequestInit = {
        method,
        headers
    }
    if (args.body !== undefined && args.body !== null) {
        if (typeof args.body === 'object' && !(args.body instanceof ArrayBuffer) && !(args.body instanceof Uint8Array)) {
            if (!Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) {
                ;(requestInit.headers as Record<string, string>)['Content-Type'] = 'application/json'
            }
            requestInit.body = JSON.stringify(args.body)
        } else {
            requestInit.body = String(args.body)
        }
    }

    const res = await fetch(url.toString(), requestInit)
    const text = await res.text()
    let body: any = text
    try {
        body = text ? JSON.parse(text) : null
    } catch {
        body = text
    }
    return {
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
        body
    }
}

async function executeSystemInfo(): Promise<any> {
    const os = await import('os')
    const cpus = os.cpus() || []
    return {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: os.uptime(),
        cpu_count: cpus.length,
        cpu_model: cpus[0]?.model || '',
        total_memory: os.totalmem(),
        free_memory: os.freemem(),
        hostname: os.hostname()
    }
}

async function runTool<T>(
    action: () => Promise<T>,
    context: AgentToolExecutionContext,
    label: string
): Promise<T> {
    return withTimeout(action(), context.timeout, label)
}

function toToolResult(data: any) {
    return {
        success: true,
        content: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        structured: data
    }
}

export const builtinAgentTools: AgentTool[] = [
    {
        name: 'http_request',
        description: '发起 HTTP/HTTPS 请求并返回响应状态、响应头和响应体。',
        schema: z.object({
            url: z.string().url(),
            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
            headers: z.record(z.string(), z.string()).optional(),
            query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))])).optional(),
            body: z.any().optional()
        }),
        async execute(args, context) {
            const result = await runTool(() => executeHttpRequest(args), context, 'http_request')
            return toToolResult(result)
        }
    },
    {
        name: 'get_system_info',
        description: '获取当前 runner 进程所在环境的系统信息。',
        schema: z.object({}),
        async execute(_args, context) {
            const result = await runTool(() => executeSystemInfo(), context, 'get_system_info')
            return toToolResult(result)
        }
    },
    {
        name: 'get_time',
        description: '获取当前时间。可选传入时区名称，例如 Asia/Shanghai。',
        schema: z.object({
            timeZone: z.string().optional()
        }),
        async execute(args, context) {
            const result = await runTool(async () => {
                const now = new Date()
                const timeZone = args.timeZone ? String(args.timeZone) : undefined
                return {
                    iso: now.toISOString(),
                    unixMs: now.getTime(),
                    locale: now.toLocaleString('zh-CN', timeZone ? { timeZone } : undefined),
                    timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                }
            }, context, 'get_time')
            return toToolResult(result)
        }
    }
]

export function getBuiltinAgentTools(enabledTools: string[]): AgentTool[] {
    const allowList = new Set(enabledTools)
    return builtinAgentTools.filter(tool => allowList.has(tool.name))
}
