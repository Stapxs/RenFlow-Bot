import { z } from 'zod'
import type { AgentTool, AgentToolExecutionContext } from './types.js'
import type { AgentNodeDescriptor, AgentNodeExecutionStructuredResult } from './types.js'

function sanitizeNodeMetadataContextFields(fields: any[] = []) {
    return fields
        .filter(field => field && typeof field === 'object')
        .map(field => ({
            key: String(field.key || ''),
            label: String(field.label || ''),
            type: String(field.type || ''),
            required: Boolean(field.required),
            dynamic: Boolean(field.dynamic),
            placeholder: field.placeholder ? String(field.placeholder) : undefined,
            tip: field.tip ? String(field.tip) : undefined,
            defaultValue: field.defaultValue,
            options: Array.isArray(field.options)? field.options.map((item: any) => ({
                    label: String(item?.label || ''),
                    value: item?.value
                })): undefined
        }))
}

function buildNodeDescriptorList(context: AgentToolExecutionContext): AgentNodeDescriptor[] {
    return context.nodeManager.getNodeList().map(metadata => ({
        nodeType: metadata.id,
        name: metadata.name,
        description: metadata.description,
        category: metadata.category,
        params: sanitizeNodeMetadataContextFields(metadata.params) as any,
        outputSchema: Array.isArray(metadata.outputSchema)? metadata.outputSchema.map(field => ({
                key: String(field.key || ''),
                label: String(field.label || ''),
                type: field.type,
                description: field.description ? String(field.description) : undefined
            })): undefined
    }))
}

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

function rewriteHttpUrlForProxy(url: string, context: AgentToolExecutionContext): string {
    const proxyPort = context.nodeContext.globalState?.get('__tauriProxyPort')
    if (!proxyPort) return url

    try {
        const parsed = new URL(url)
        const scheme = parsed.protocol.replace(':', '')
        return `http://127.0.0.1:${proxyPort}/relay/${scheme}/${parsed.host}${parsed.pathname}${parsed.search}`
    } catch {
        return url
    }
}

async function executeHttpRequest(args: Record<string, any>, context: AgentToolExecutionContext): Promise<any> {
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
                (requestInit.headers as Record<string, string>)['Content-Type'] = 'application/json'
            }
            requestInit.body = JSON.stringify(args.body)
        } else {
            requestInit.body = String(args.body)
        }
    }

    const res = await fetch(rewriteHttpUrlForProxy(url.toString(), context), requestInit)
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
    const os = await import('node:os')
    const cpus = typeof os.cpus === 'function' ? (os.cpus() || []) : []
    return {
        platform: typeof os.platform === 'function' ? os.platform() : '',
        arch: typeof os.arch === 'function' ? os.arch() : '',
        release: typeof os.release === 'function' ? os.release() : '',
        uptime: typeof os.uptime === 'function' ? os.uptime() : 0,
        cpu_count: cpus.length,
        cpu_model: cpus[0]?.model || '',
        total_memory: typeof os.totalmem === 'function' ? os.totalmem() : 0,
        free_memory: typeof os.freemem === 'function' ? os.freemem() : 0,
        hostname: typeof os.hostname === 'function' ? os.hostname() : ''
    }
}

async function executeOpenUrl(args: Record<string, any>): Promise<any> {
    const url = String(args.url || '').trim()
    if (!url) {
        throw new Error('url 不能为空')
    }

    const tauriInternals = (globalThis as any).__TAURI_INTERNALS__
    if (!tauriInternals) {
        return {
            opened: false,
            reason: 'not_tauri',
            url
        }
    }

    try {
        const injectedInvoke = (globalThis as any).__agentTauriInvoke
        const invoke = typeof injectedInvoke === 'function'
            ? injectedInvoke
            : (await import('@tauri-apps/api/core')).invoke
        await invoke('sys_open_in_browser', { data: url })
        return {
            opened: true,
            url
        }
    } catch (error: any) {
        return {
            opened: false,
            reason: 'invoke_failed',
            url,
            error: error?.message || String(error)
        }
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

async function executeNodeByType(args: Record<string, any>, context: AgentToolExecutionContext): Promise<AgentNodeExecutionStructuredResult> {
    const nodeType = String(args.nodeType || '').trim()
    const metadata = context.nodeManager.getNodeMetadata(nodeType)

    if (!metadata) {
        throw new Error(`节点不存在: ${nodeType}`)
    }

    const input = args.input === undefined ? {} : args.input
    const params = (args.params && typeof args.params === 'object' && !Array.isArray(args.params)) ? args.params : {}
    const result = await context.nodeManager.executeNode(
        `${context.nodeContext.nodeId}:${nodeType}:tool`,
        nodeType,
        input,
        params,
        {
            globalState: context.nodeContext.globalState,
            logger: context.nodeContext.logger
        }
    )

    return {
        success: result.success,
        nodeType,
        nodeName: metadata.name,
        input,
        params,
        output: result.output,
        error: result.error,
        raw: result
    }
}

export const builtinAgentTools: AgentTool[] = [
    {
        name: 'http_request',
        description: '发起 HTTP/HTTPS 请求并返回响应状态、响应头和响应体。',
        strict: true,
        schema: z.object({
            url: z.string().url(),
            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
            headers: z.record(z.string(), z.string()).optional(),
            query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))])).optional(),
            body: z.any().optional()
        }),
        parametersSchema: {
            type: 'object',
            properties: {
                url: { type: 'string' },
                method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
                },
                headers: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                },
                query: {
                    type: 'object',
                    additionalProperties: {
                        anyOf: [
                            { type: 'string' },
                            { type: 'number' },
                            { type: 'boolean' },
                            { type: 'array', items: {} }
                        ]
                    }
                },
                body: {}
            },
            additionalProperties: false,
            required: ['url']
        },
        async execute(args, context) {
            const result = await runTool(() => executeHttpRequest(args, context), context, 'http_request')
            return toToolResult(result)
        }
    },
    {
        name: 'get_system_info',
        description: '获取当前 runner 进程所在环境的系统信息。',
        strict: true,
        schema: z.object({}),
        parametersSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
        },
        async execute(_args, context) {
            const result = await runTool(() => executeSystemInfo(), context, 'get_system_info')
            return toToolResult(result)
        }
    },
    {
        name: 'get_time',
        description: '获取当前时间。可选传入时区名称，例如 Asia/Shanghai。',
        strict: true,
        schema: z.object({
            timeZone: z.string().optional()
        }),
        parametersSchema: {
            type: 'object',
            properties: {
                timeZone: { type: 'string' }
            },
            additionalProperties: false
        },
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
    },
    {
        name: 'open_url_in_browser',
        description: '在 Tauri 桌面环境中使用系统浏览器打开链接；非 Tauri 环境下返回成功但不执行。',
        strict: true,
        schema: z.object({
            url: z.string().url()
        }),
        parametersSchema: {
            type: 'object',
            properties: {
                url: { type: 'string' }
            },
            additionalProperties: false,
            required: ['url']
        },
        async execute(args, context) {
            const result = await runTool(() => executeOpenUrl(args), context, 'open_url_in_browser')
            return toToolResult(result)
        }
    },
    {
        name: 'list_available_nodes',
        description: '获取当前可执行的节点类型列表，以及每个节点的输入参数和输出结构。',
        strict: true,
        schema: z.object({}),
        parametersSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
        },
        async execute(_args, context) {
            const result = await runTool(async () => ({
                nodes: buildNodeDescriptorList(context)
            }), context, 'list_available_nodes')
            return toToolResult(result)
        }
    },
    {
        name: 'execute_node',
        description: '按节点类型直接执行一次节点功能，传入 input 和 params，返回该节点输出。',
        strict: true,
        schema: z.object({
            nodeType: z.string().min(1),
            input: z.any().optional(),
            params: z.record(z.string(), z.any()).optional()
        }),
        parametersSchema: {
            type: 'object',
            properties: {
                nodeType: { type: 'string' },
                input: {},
                params: {
                    type: 'object',
                    additionalProperties: {}
                }
            },
            additionalProperties: false,
            required: ['nodeType']
        },
        async execute(args, context) {
            const result = await runTool(() => executeNodeByType(args, context), context, 'execute_node')
            return toToolResult(result)
        }
    }
]

export function getBuiltinAgentTools(enabledTools: string[]): AgentTool[] {
    const allowList = new Set(enabledTools)
    return builtinAgentTools.filter(tool => allowList.has(tool.name))
}
