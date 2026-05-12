import OpenAI from 'openai'
import type { NodeExecutionResult, NodeContext } from '../../types.js'
import { agentSessionManager } from './session.js'
import { getBuiltinAgentTools } from './tools.js'
import type {
    AgentMessage,
    AgentRuntimeCallbacks,
    AgentRuntimeParams,
    AgentSession,
    AgentTool,
    AgentToolExecutionResult
} from './types.js'

function parseJson(text: string, fallback: any) {
    try {
        return JSON.parse(text)
    } catch {
        return fallback
    }
}

function callAgentCallback(context: NodeContext, name: keyof AgentRuntimeCallbacks, payload: Record<string, any>): void {
    const callbacks = (context as any).agentCallbacks as AgentRuntimeCallbacks | undefined
    const callback = callbacks?.[name]
    if (typeof callback === 'function') {
        callback(payload)
    }
}

function logAgentEvent(context: NodeContext, event: string, payload: Record<string, any>): void {
    context.logger.log(`[Agent:${event}]`, payload)
}

function normalizeToolArguments(raw: any): Record<string, any> {
    if (!raw) return {}
    if (typeof raw === 'string') return parseJson(raw, {})
    if (typeof raw === 'object') return raw
    return {}
}

function summarizeMessages(messages: AgentMessage[]): string {
    return messages
        .map(message => `${message.role}: ${message.content.replace(/\s+/g, ' ').slice(0, 240)}`)
        .join('\n')
}

function ensureSessionWindow(session: AgentSession, compressionWindow: number): void {
    session.recentMessages = session.history.slice(-compressionWindow)
}

function compactSessionIfNeeded(session: AgentSession, params: AgentRuntimeParams, context: NodeContext): boolean {
    if (session.history.length < params.compressionThreshold) {
        ensureSessionWindow(session, params.compressionWindow)
        return false
    }

    const keepCount = Math.max(1, params.compressionWindow)
    const compressCount = Math.max(0, session.history.length - keepCount)
    if (compressCount <= 0) {
        ensureSessionWindow(session, keepCount)
        return false
    }

    const compressed = session.history.slice(0, compressCount)
    const recent = session.history.slice(-keepCount)
    const summaryBlock = summarizeMessages(compressed)
    session.summary = [session.summary, summaryBlock].filter(Boolean).join('\n').trim()
    session.history = recent
    session.recentMessages = recent
    callAgentCallback(context, 'onAgentCompression', {
        sessionKey: session.sessionKey,
        compressedMessages: compressed.length,
        recentMessages: recent.length
    })
    logAgentEvent(context, 'compression', {
        sessionKey: session.sessionKey,
        compressedMessages: compressed.length,
        recentMessages: recent.length
    })
    return true
}

function buildInstructions(params: AgentRuntimeParams, session: AgentSession): string {
    const parts = [params.systemPrompt.trim()]
    if (session.summary.trim()) {
        parts.push(`会话摘要：\n${session.summary.trim()}`)
    }
    parts.push('你正在 RenFlow runner 的 Agent 模式中运行。优先直接回答，只有在确实需要外部信息时才调用工具。')
    return parts.filter(Boolean).join('\n\n')
}

function buildInputFromSession(session: AgentSession): Array<Record<string, any>> {
    return session.recentMessages.map(message => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }]
    }))
}

function safeStringify(value: any): string {
    if (typeof value === 'string') return value
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function getResponseText(response: any): string {
    if (typeof response?.output_text === 'string') return response.output_text
    if (typeof response?.output_text === 'function') {
        try {
            return String(response.output_text())
        } catch {
            return ''
        }
    }
    const texts: string[] = []
    for (const item of response?.output || []) {
        if (item?.type === 'message') {
            for (const content of item.content || []) {
                if (content?.type === 'output_text' && content.text) texts.push(String(content.text))
            }
        }
    }
    return texts.join('')
}

function getFunctionCalls(response: any): any[] {
    return (response?.output || []).filter((item: any) => item?.type === 'function_call')
}

function getZodKind(schema: any): string | undefined {
    return schema?._def?.typeName || schema?._def?.type
}

function zodToJsonSchema(schema: any): any {
    const kind = getZodKind(schema)
    switch (kind) {
    case 'ZodObject':
    case 'object': {
        const shape = typeof schema.shape === 'function' ? schema.shape() : schema.shape
        const properties: Record<string, any> = {}
        const required: string[] = []
        for (const [key, child] of Object.entries(shape || {})) {
            properties[key] = zodToJsonSchema(child)
            const childKind = getZodKind(child)
            if (childKind !== 'ZodOptional' && childKind !== 'optional' && childKind !== 'ZodDefault' && childKind !== 'default') {
                required.push(key)
            }
        }
        return {
            type: 'object',
            properties,
            additionalProperties: false,
            ...(required.length ? { required } : {})
        }
    }
    case 'ZodString':
    case 'string':
        return { type: 'string' }
    case 'ZodNumber':
    case 'number':
        return { type: 'number' }
    case 'ZodBoolean':
    case 'boolean':
        return { type: 'boolean' }
    case 'ZodAny':
    case 'any':
        return {}
    case 'ZodArray':
    case 'array':
        return { type: 'array', items: zodToJsonSchema(schema._def?.type || schema._def?.element) }
    case 'ZodEnum':
    case 'enum':
        return { type: 'string', enum: schema.options || schema._def?.values || [] }
    case 'ZodUnion':
    case 'union': {
        const options = schema.options || schema._def?.options || []
        return { anyOf: options.map((item: any) => zodToJsonSchema(item)) }
    }
    case 'ZodOptional':
    case 'optional':
    case 'ZodDefault':
    case 'default':
        return zodToJsonSchema(schema._def?.innerType)
    case 'ZodRecord':
    case 'record':
        return { type: 'object', additionalProperties: zodToJsonSchema(schema._def?.valueType || {}) }
    default:
        return {}
    }
}

function buildOpenAiTools(tools: AgentTool[]): any[] {
    return tools.map(tool => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.schema)
    }))
}

function buildUpstreamError(error: any) {
    const status = Number(error?.status ?? error?.statusCode ?? 0) || null
    const headers = error?.headers || null
    const body = error?.error || error?.response || error?.cause || null
    const details = (body && typeof body === 'object') ? body : null
    const message = details?.message
        || details?.detail
        || error?.message
        || '上游返回错误'
    const retryAfterRaw = details?.retry_after
        ?? details?.retryAfter
        ?? headers?.['retry-after']
        ?? headers?.['Retry-After']
        ?? 0
    const retryAfter = Number(retryAfterRaw)
    const retryable = Boolean(details?.retryable)
        || Boolean(error?.retryable)
        || (typeof status === 'number' && status >= 500)
    const code = details?.error_code ?? details?.code ?? null
    const name = details?.error_name ?? details?.type ?? null

    return {
        message: String(message),
        status,
        retryable,
        retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
        code,
        name,
        details
    }
}

async function withRetry<T>(params: AgentRuntimeParams, action: (attempt: number) => Promise<T>): Promise<T> {
    let lastError: any = null
    const maxRetries = Math.min(Math.max(0, params.retries), 5)
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await action(attempt)
        } catch (error) {
            lastError = error
            const errorInfo = buildUpstreamError(error)
            if (attempt <= maxRetries && errorInfo.retryable) {
                const waitMs = errorInfo.retryAfter
                    ? Math.max(1000, Math.min(errorInfo.retryAfter * 1000, 120000))
                    : 200 * attempt
                await new Promise(resolve => setTimeout(resolve, waitMs))
            }
        }
    }
    throw lastError
}

async function executeToolCall(
    tool: AgentTool | undefined,
    toolCall: any,
    params: AgentRuntimeParams,
    context: NodeContext,
    session: AgentSession
): Promise<{ outputItem: Record<string, any>; trace: Record<string, any>; toolResult: AgentToolExecutionResult }> {
    const args = normalizeToolArguments(toolCall?.arguments)
    const trace = {
        id: String(toolCall?.call_id || toolCall?.id || `${toolCall?.name || 'tool'}-${Date.now()}`),
        name: String(toolCall?.name || ''),
        args,
        startedAt: new Date().toISOString()
    }

    callAgentCallback(context, 'onAgentToolCallStart', {
        sessionKey: session.sessionKey,
        toolCall: trace
    })
    logAgentEvent(context, 'tool_start', {
        sessionKey: session.sessionKey,
        tool: trace.name,
        args
    })

    if (!tool) {
        const error = `未启用工具: ${trace.name}`
        const toolResult = {
            success: false,
            content: JSON.stringify({ success: false, error }, null, 2),
            error
        }
        return {
            outputItem: {
                type: 'function_call_output',
                call_id: toolCall?.call_id,
                output: toolResult.content
            },
            trace,
            toolResult
        }
    }

    try {
        const validatedArgs = tool.schema.parse(args) as Record<string, any>
        const toolResult = await tool.execute(validatedArgs, {
            sessionKey: session.sessionKey,
            nodeContext: context,
            timeout: Math.max(1000, Math.min(params.timeout, 30000))
        })
        return {
            outputItem: {
                type: 'function_call_output',
                call_id: toolCall?.call_id,
                output: toolResult.content
            },
            trace,
            toolResult
        }
    } catch (error: any) {
        const message = `工具执行失败: ${error?.message || String(error)}`
        const toolResult = {
            success: false,
            content: JSON.stringify({ success: false, error: message }, null, 2),
            error: message
        }
        return {
            outputItem: {
                type: 'function_call_output',
                call_id: toolCall?.call_id,
                output: toolResult.content
            },
            trace,
            toolResult
        }
    }
}

export async function runAgentLlmNode(
    params: AgentRuntimeParams,
    context: NodeContext
): Promise<NodeExecutionResult> {
    if (params.provider !== 'openai') {
        return { success: false, error: `Agent 模式当前仅支持 OpenAI，收到 provider=${params.provider}` }
    }
    if (!params.sessionKey.trim()) {
        return { success: false, error: 'Agent 模式需要非空 sessionKey' }
    }
    if (!params.apiKey.trim()) {
        return { success: false, error: 'API Key 不能为空' }
    }

    const proxyPort = context.globalState?.get('__tauriProxyPort')
    const resolvedBaseUrl = (() => {
        if (!proxyPort) return params.baseUrl
        try {
            const parsed = new URL(params.baseUrl)
            const scheme = parsed.protocol.replace(':', '')
            const basePath = parsed.pathname.replace(/\/$/, '')
            return `http://127.0.0.1:${proxyPort}/relay/${scheme}/${parsed.host}${basePath}`
        } catch {
            return params.baseUrl
        }
    })()

    const client = new OpenAI({
        apiKey: params.apiKey,
        baseURL: resolvedBaseUrl,
        dangerouslyAllowBrowser: true
    })
    const session = agentSessionManager.get(params.sessionKey)
    agentSessionManager.appendMessage(session, {
        role: 'user',
        content: params.prompt
    })
    compactSessionIfNeeded(session, params, context)

    const enabledTools = getBuiltinAgentTools(params.enabledTools)
    const toolsByName = new Map(enabledTools.map(tool => [tool.name, tool]))
    const toolDefinitions = buildOpenAiTools(enabledTools)
    const startedAt = Date.now()

    callAgentCallback(context, 'onAgentSessionStart', {
        sessionKey: session.sessionKey,
        model: params.model,
        toolCount: enabledTools.length
    })
    logAgentEvent(context, 'session_start', {
        sessionKey: session.sessionKey,
        model: params.model,
        toolCount: enabledTools.length
    })

    let finalResponse: any = null
    let accumulatedText = ''
    let streamEvents: Array<Record<string, any>> = []
    let toolTurnCount = 0
    let nextInput: any[] = buildInputFromSession(session)

    try {
        while (toolTurnCount < params.maxTurns) {
            const requestBody: Record<string, any> = {
                model: params.model,
                instructions: buildInstructions(params, session),
                input: nextInput,
                stream: true,
                temperature: params.temperature
            }
            if (params.maxTokens > 0) requestBody.max_output_tokens = params.maxTokens
            if (toolDefinitions.length > 0) requestBody.tools = toolDefinitions

            const stream = await withRetry(params, async attempt => {
                context.logger.log(`LlmNode agent attempt ${attempt} Responses API ${params.baseUrl}`)
                return client.responses.stream(requestBody as any)
            })

            streamEvents = []
            accumulatedText = ''
            for await (const event of stream) {
                const eventWithDelta = event as { type: string; delta?: string }
                streamEvents.push({
                    type: eventWithDelta.type,
                    ...(eventWithDelta.delta ? { delta: eventWithDelta.delta } : {})
                })
                if (eventWithDelta.type === 'response.output_text.delta' && eventWithDelta.delta) {
                    accumulatedText += String(eventWithDelta.delta)
                    callAgentCallback(context, 'onAgentToken', {
                        sessionKey: session.sessionKey,
                        delta: String(eventWithDelta.delta)
                    })
                }
            }
            finalResponse = await stream.finalResponse()
            session.lastResponseId = finalResponse?.id

            const functionCalls = getFunctionCalls(finalResponse)
            if (functionCalls.length === 0) {
                const finalText = getResponseText(finalResponse) || accumulatedText
                agentSessionManager.appendMessage(session, {
                    role: 'assistant',
                    content: finalText
                })
                agentSessionManager.save(session)
                callAgentCallback(context, 'onAgentSessionComplete', {
                    sessionKey: session.sessionKey,
                    model: finalResponse?.model || params.model,
                    durationMs: Date.now() - startedAt
                })
                logAgentEvent(context, 'session_complete', {
                    sessionKey: session.sessionKey,
                    durationMs: Date.now() - startedAt
                })
                return {
                    success: true,
                    output: {
                        text: finalText,
                        model: finalResponse?.model || params.model,
                        provider: params.provider,
                        usage: finalResponse?.usage || null,
                        sessionInfo: {
                            sessionKey: session.sessionKey,
                            historyCount: session.history.length,
                            summary: session.summary,
                            recentMessages: session.recentMessages,
                            toolTrace: session.toolTrace,
                            lastResponseId: session.lastResponseId,
                            mcpServers: params.mcpServers,
                            skills: params.skills,
                            mcpActivated: false,
                            skillsActivated: false
                        },
                        raw: {
                            response: finalResponse,
                            streamEvents,
                            sessionInfo: {
                                sessionKey: session.sessionKey,
                                lastResponseId: session.lastResponseId,
                                mcpServers: params.mcpServers,
                                skills: params.skills,
                                mcpActivated: false,
                                skillsActivated: false
                            }
                        }
                    }
                }
            }

            const toolOutputs: any[] = []
            for (const toolCall of functionCalls) {
                const tool = toolsByName.get(String(toolCall?.name || ''))
                const { outputItem, trace, toolResult } = await executeToolCall(tool, toolCall, params, context, session)
                const completedTrace = {
                    ...trace,
                    completedAt: new Date().toISOString(),
                    success: toolResult.success,
                    resultPreview: toolResult.content.slice(0, 300),
                    ...(toolResult.error ? { error: toolResult.error } : {})
                }
                session.toolTrace.push(completedTrace as any)
                toolOutputs.push(outputItem)
                callAgentCallback(context, 'onAgentToolCallComplete', {
                    sessionKey: session.sessionKey,
                    toolCall: completedTrace
                })
                logAgentEvent(context, 'tool_complete', {
                    sessionKey: session.sessionKey,
                    tool: trace.name,
                    success: completedTrace.success
                })
            }

            nextInput = [
                ...((finalResponse?.output || []).map((item: any) => {
                    if (!item || typeof item !== 'object') return item
                    const cloned = { ...item }
                    if ('status' in cloned) delete cloned.status
                    return cloned
                })),
                ...toolOutputs
            ]
            toolTurnCount += 1
        }

        return {
            success: false,
            error: `Agent 超过最大轮数限制: ${params.maxTurns}`,
            output: {
                text: accumulatedText,
                model: params.model,
                provider: params.provider,
                usage: finalResponse?.usage || null,
                raw: {
                    response: finalResponse,
                    streamEvents,
                    sessionInfo: {
                        sessionKey: session.sessionKey,
                        lastResponseId: session.lastResponseId
                    }
                }
            }
        }
    } catch (error: any) {
        const errorInfo = buildUpstreamError(error)
        agentSessionManager.save(session)
        return {
            success: false,
            error: `Agent 请求失败: ${errorInfo.message}`,
            output: {
                text: accumulatedText,
                model: params.model,
                provider: params.provider,
                usage: finalResponse?.usage || null,
                raw: {
                    error: safeStringify(error),
                    upstreamError: {
                        status: errorInfo.status,
                        retryable: errorInfo.retryable,
                        retryAfter: errorInfo.retryAfter,
                        errorCode: errorInfo.code,
                        errorName: errorInfo.name,
                        details: errorInfo.details
                    },
                    streamEvents,
                    sessionInfo: {
                        sessionKey: session.sessionKey,
                        lastResponseId: session.lastResponseId,
                        mcpServers: params.mcpServers,
                        skills: params.skills,
                        mcpActivated: false,
                        skillsActivated: false
                    }
                }
            }
        }
    }
}
