import type { NodeExecutionResult, NodeContext } from '../../types.js'
import type { NodeManager } from '../../NodeManager.js'
import { agentSessionManager } from './session.js'
import { getBuiltinAgentTools } from './tools.js'
import type {
    AgentContinuationItem,
    AgentContextMessage,
    AgentMcpServerConfig,
    AgentMcpSessionState,
    AgentRuntimeCallbacks,
    AgentRuntimeParams,
    AgentSession,
    AgentTool,
    AgentToolExecutionResult
} from './types.js'

type McpHttpCaller = (method: string, params?: Record<string, any>) => Promise<any>

type McpResolvedTool = {
    serverLabel: string
    remoteName: string
    tool: AgentTool
}

type JsonRpcCallResult = {
    result: any
    sessionId?: string
}

function parseJson(text: string, fallback: any) {
    try {
        return JSON.parse(text)
    } catch {
        return fallback
    }
}

async function createNodeManager(context: NodeContext): Promise<NodeManager> {
    const injectedNodeManager = context.globalState?.get('__agentNodeManager')
    if (injectedNodeManager) return injectedNodeManager as NodeManager

    const module = await import('../../NodeManager.js')
    return new module.NodeManager()
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
    if (typeof raw === 'string') {
        const parsed = parseJson(raw, null)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed
        }

        // Some OpenAI-compatible providers may concatenate multiple JSON objects
        // into one string like {}{"sessionId":"x"}. Prefer the last valid object.
        const matches = raw.match(/\{[\s\S]*?\}/g) || []
        for (let index = matches.length - 1; index >= 0; index -= 1) {
            const candidate = parseJson(matches[index], null)
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                return candidate
            }
        }
        return {}
    }
    if (typeof raw === 'object') return raw
    return {}
}

function safeStringify(value: any): string {
    if (typeof value === 'string') return value
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function buildResponsesEndpoint(baseUrl: string): string {
    return `${baseUrl.replace(/\/$/, '')}/responses`
}

function sanitizeToolNamePart(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
}

async function parseResponsePayload(res: Response): Promise<any> {
    const text = await res.text()
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        return { rawText: text }
    }
}

function createResponsesCaller(params: AgentRuntimeParams, context: NodeContext, resolvedBaseUrl: string) {
    const rawCreate = context.globalState?.get('__agentOpenAIResponsesCreate')
    if (typeof rawCreate === 'function') {
        return (body: Record<string, any>) => rawCreate(body, params)
    }

    const factory = context.globalState?.get('__agentOpenAIClientFactory')
    if (typeof factory === 'function') {
        return async (body: Record<string, any>) => {
            const client = factory(params)
            return client.responses.create(body as any)
        }
    }

    return async (body: Record<string, any>) => {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), params.timeout)
        try {
            const res = await (globalThis as any).fetch(buildResponsesEndpoint(resolvedBaseUrl), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${params.apiKey}`
                },
                body: JSON.stringify(body),
                signal: ac.signal
            })
            const payload = await parseResponsePayload(res)
            if (!res.ok || payload?.error) {
                throw {
                    status: res.status,
                    error: payload?.error || payload,
                    response: payload
                }
            }
            return payload
        } finally {
            clearTimeout(timer)
        }
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
                if ((content?.type === 'output_text' || content?.type === 'text') && content.text) {
                    texts.push(String(content.text))
                }
            }
        }
    }
    return texts.join('')
}

function getFunctionCalls(response: any): any[] {
    return (response?.output || []).filter((item: any) => item?.type === 'function_call')
}

function getFunctionCallsFromStreamEvents(streamEvents: Array<Record<string, any>>): any[] {
    return streamEvents
        .filter(event => event?.type === 'response.output_item.done' && event?.item?.type === 'function_call')
        .map(event => event.item)
}

function summarizeAgentInput(input: any): Record<string, any> {
    if (Array.isArray(input)) {
        return {
            type: 'array',
            count: input.length,
            items: input.slice(0, 8).map(item => ({
                type: item?.type || item?.role || typeof item,
                role: item?.role,
                call_id: item?.call_id,
                name: item?.name
            }))
        }
    }
    return {
        type: typeof input
    }
}

function getZodKind(schema: any): string | undefined {
    return schema?._def?.typeName || schema?._def?.type
}

function buildOpenAiTools(tools: AgentTool[]): any[] {
    return tools.map(tool => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        strict: tool.strict !== false,
        parameters: tool.parametersSchema || {}
    }))
}

function buildUpstreamError(error: any) {
    const status = Number(error?.status ?? error?.statusCode ?? 0) || null
    const body = error?.error || error?.response || error?.cause || null
    const details = (body && typeof body === 'object') ? body : null
    const message = details?.message
        || details?.detail
        || error?.message
        || '上游返回错误'
    const code = details?.error_code ?? details?.code ?? null
    const name = details?.error_name ?? details?.type ?? null

    return {
        message: String(message),
        status,
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
            if (attempt <= maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 500))
            }
        }
    }
    throw lastError
}

function isContinuationCandidate(item: any): boolean {
    const type = String(item?.type || '')
    return type === 'reasoning' || type === 'function_call'
}

function normalizeContinuationItem(item: any): AgentContinuationItem {
    const normalized = JSON.parse(JSON.stringify(item))
    if (normalized?.type === 'reasoning' && normalized.encrypted_content === undefined && normalized.summary !== undefined) {
        delete normalized.summary
    }
    return normalized
}

function extractContinuationItems(response: any, streamEvents: Array<Record<string, any>>): AgentContinuationItem[] {
    const finalItems = Array.isArray(response?.output) ? response.output.filter(isContinuationCandidate) : []
    if (finalItems.length > 0) {
        return finalItems.map(normalizeContinuationItem)
    }
    return streamEvents
        .filter(event => event?.type === 'response.output_item.done' && isContinuationCandidate(event?.item))
        .map(event => normalizeContinuationItem(event.item))
}

function normalizeMcpServers(servers: AgentMcpServerConfig[]): AgentMcpServerConfig[] {
    return servers
        .filter(server => server?.enabled !== false)
        .filter(server => String(server?.serverLabel || '').trim() && String(server?.serverUrl || '').trim())
        .map(server => ({
            serverLabel: String(server.serverLabel).trim(),
            serverUrl: String(server.serverUrl).trim(),
            allowedTools: Array.isArray(server.allowedTools)? server.allowedTools.map(item => String(item)).filter(Boolean): [],
            requireApproval: server.requireApproval === 'never' ? 'never' : 'always',
            headers: server.headers && typeof server.headers === 'object'? Object.fromEntries(
                    Object.entries(server.headers)
                        .filter(([key, value]) => String(key).trim() && value !== undefined && value !== null)
                        .map(([key, value]) => [String(key), String(value)])
                ): undefined,
            enabled: server.enabled !== false
        }))
}

function getMcpToolName(serverLabel: string, toolName: string): string {
    const left = sanitizeToolNamePart(serverLabel) || 'mcp'
    const right = sanitizeToolNamePart(toolName) || 'tool'
    return `mcp__${left}__${right}`
}

async function callJsonRpc(
    server: AgentMcpServerConfig,
    method: string,
    params: Record<string, any> | undefined,
    timeoutMs: number,
    sessionId?: string,
    isNotification = false
): Promise<JsonRpcCallResult> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
        const requestBody = {
            jsonrpc: '2.0',
            ...(isNotification ? {} : { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
            method,
            ...(params ? { params } : {})
        }
        const res = await (globalThis as any).fetch(server.serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
                ...(server.headers || {})
            },
            body: JSON.stringify(requestBody),
            signal: ac.signal
        })
        const payload = await parseResponsePayload(res)
        if (!res.ok) {
            throw new Error(`MCP ${server.serverLabel} ${method} HTTP ${res.status}`)
        }
        if (isNotification) {
            return {
                result: payload,
                sessionId: res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id') || sessionId || undefined
            }
        }
        if (payload?.error) {
            throw new Error(payload.error?.message || `MCP ${server.serverLabel} ${method} failed`)
        }
        return {
            result: payload?.result ?? payload,
            sessionId: res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id') || sessionId || undefined
        }
    } finally {
        clearTimeout(timer)
    }
}

function getMcpSessionKey(server: AgentMcpServerConfig): string {
    return `${server.serverLabel}@@${server.serverUrl}`
}

function getOrCreateMcpSessionState(session: AgentSession, server: AgentMcpServerConfig): AgentMcpSessionState {
    const key = getMcpSessionKey(server)
    const existing = session.mcpSessions[key]
    if (existing) return existing

    const created: AgentMcpSessionState = {
        serverLabel: server.serverLabel,
        serverUrl: server.serverUrl,
        initialized: false,
        updatedAt: new Date().toISOString()
    }
    session.mcpSessions[key] = created
    return created
}

function createMcpHttpCaller(server: AgentMcpServerConfig, timeoutMs: number, agentSession: AgentSession): McpHttpCaller {
    return async (method: string, params?: Record<string, any>) => {
        const state = getOrCreateMcpSessionState(agentSession, server)
        if (!state.initialized) {
            const initializeResult = await callJsonRpc(server, 'initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'renflow-runner',
                    version: '0.1.5'
                }
            }, timeoutMs)

            if (initializeResult.sessionId) {
                state.sessionId = initializeResult.sessionId
            }

            await callJsonRpc(server, 'notifications/initialized', undefined, timeoutMs, state.sessionId, true)
            state.initialized = true
            state.updatedAt = new Date().toISOString()
        }

        const response = await callJsonRpc(server, method, params, timeoutMs, state.sessionId)
        if (response.sessionId) {
            state.sessionId = response.sessionId
        }
        state.updatedAt = new Date().toISOString()
        return response.result
    }
}

async function resolveLocalMcpTools(
    servers: AgentMcpServerConfig[],
    timeoutMs: number,
    agentSession: AgentSession
): Promise<{ tools: AgentTool[]; resolvedTools: McpResolvedTool[] }> {
    const resolvedTools: McpResolvedTool[] = []

    for (const server of servers) {
        const callMcp = createMcpHttpCaller(server, timeoutMs, agentSession)
        const listResult = await callMcp('tools/list', {})
        const remoteTools = Array.isArray(listResult?.tools) ? listResult.tools : []

        for (const remoteTool of remoteTools) {
            const remoteName = String(remoteTool?.name || '').trim()
            if (!remoteName) continue
            if (server.allowedTools && server.allowedTools.length > 0 && !server.allowedTools.includes(remoteName)) continue

            const localName = getMcpToolName(server.serverLabel, remoteName)
            const localTool: AgentTool = {
                name: localName,
                description: String(remoteTool?.description || `${server.serverLabel}:${remoteName}`),
                parametersSchema: (remoteTool?.inputSchema && typeof remoteTool.inputSchema === 'object') ? remoteTool.inputSchema : {
                    type: 'object',
                    properties: {},
                    additionalProperties: true
                },
                strict: false,
                schema: {
                    parse: (value: unknown) => {
                        if (value && typeof value === 'object' && !Array.isArray(value)) {
                            return value as Record<string, any>
                        }
                        return {}
                    }
                } as any,
                async execute(args) {
                    const result = await callMcp('tools/call', {
                        name: remoteName,
                        arguments: args
                    })
                    return {
                        success: true,
                        content: safeStringify(result),
                        structured: result
                    }
                }
            }

            resolvedTools.push({
                serverLabel: server.serverLabel,
                remoteName,
                tool: localTool
            })
        }
    }

    return {
        tools: resolvedTools.map(item => item.tool),
        resolvedTools
    }
}

function shouldIncludeTemperature(model: string): boolean {
    return !/^gpt-5/i.test(model.trim())
}

function buildInitialInput(params: AgentRuntimeParams): Array<Record<string, any>> {
    return [{
        type: 'message',
        role: 'user',
        content: [
            {
                type: 'input_text',
                text: params.prompt
            }
        ]
    }]
}

function toResponsesMessage(message: AgentContextMessage): Record<string, any> {
    const isAssistantLike = message.role === 'assistant' || message.role === 'tool'
    return {
        type: 'message',
        role: message.role === 'tool' ? 'assistant' : message.role,
        content: [
            {
                type: isAssistantLike ? 'output_text' : 'input_text',
                text: message.role === 'tool'
                    ? `[Tool ${message.toolName || 'tool'}]\n${message.content}`
                    : message.content
            }
        ],
        ...(message.role === 'assistant' ? { phase: 'commentary' } : {})
    }
}

function buildTurnInput(session: AgentSession, toolOutputs: any[]): any[] {
    return [
        ...session.contextMessages.map(toResponsesMessage),
        ...toolOutputs
    ]
}

function appendContextMessage(session: AgentSession, message: AgentContextMessage): void {
    session.contextMessages.push(message)
    if (session.contextMessages.length > 24) {
        session.contextMessages = session.contextMessages.slice(-24)
    }
}

function buildStatelessInputFromSession(session: AgentSession): any[] {
    return [
        ...session.contextMessages.map(toResponsesMessage),
        ...session.pendingToolOutputs
    ]
}

async function executeToolCall(
    tool: AgentTool | undefined,
    toolCall: any,
    params: AgentRuntimeParams,
    context: NodeContext,
    session: AgentSession,
    nodeManager: NodeManager
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
    logAgentEvent(context, 'tool_triggered', {
        sessionKey: session.sessionKey,
        tool: trace.name,
        callId: trace.id,
        args
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
            timeout: Math.max(1000, Math.min(params.timeout, 30000)),
            nodeManager
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

    const callResponsesApi = createResponsesCaller({
        ...params,
        baseUrl: resolvedBaseUrl
    }, context, resolvedBaseUrl)
    const session = agentSessionManager.get(params.sessionKey)
    if (session.contextMessages.length === 0) {
        appendContextMessage(session, {
            role: 'user',
            content: params.prompt
        })
    } else if (session.contextMessages[session.contextMessages.length - 1]?.content !== params.prompt) {
        appendContextMessage(session, {
            role: 'user',
            content: params.prompt
        })
    }
    const enabledTools = getBuiltinAgentTools(params.enabledTools)
    const nodeManager = await createNodeManager(context)
    const normalizedMcpServers = normalizeMcpServers(params.mcpServers)
    const localMcp = await resolveLocalMcpTools(normalizedMcpServers, Math.max(1000, Math.min(params.timeout, 30000)), session)
    const allTools = [...enabledTools, ...localMcp.tools]
    const toolsByName = new Map(allTools.map(tool => [tool.name, tool]))
    const toolDefinitions = buildOpenAiTools(allTools)
    const startedAt = Date.now()

    callAgentCallback(context, 'onAgentSessionStart', {
        sessionKey: session.sessionKey,
        model: params.model,
        toolCount: allTools.length,
        mcpServerCount: normalizedMcpServers.length
    })
    logAgentEvent(context, 'session_start', {
        sessionKey: session.sessionKey,
        model: params.model,
        toolCount: allTools.length,
        mcpServerCount: normalizedMcpServers.length
    })

    let finalResponse: any = null
    let accumulatedText = ''
    let streamEvents: Array<Record<string, any>> = []
    let toolTurnCount = 0
    session.compatibilityMode = 'stateless'
    let nextInput: any[] = session.contextMessages.length > 1 || session.pendingToolOutputs.length > 0 || session.continuationItems.length > 0
        ? buildStatelessInputFromSession(session)
        : buildInitialInput(params)

    try {
        while (toolTurnCount < params.maxTurns) {
            const turnNumber = toolTurnCount + 1
            const requestBody: Record<string, any> = {
                model: params.model,
                input: nextInput
            }
            if (params.systemPrompt.trim()) {
                requestBody.instructions = params.systemPrompt.trim()
            }
            if (params.maxTokens > 0) requestBody.max_output_tokens = params.maxTokens
            if (toolDefinitions.length > 0) requestBody.tools = toolDefinitions
            if (shouldIncludeTemperature(params.model)) {
                requestBody.temperature = params.temperature
            }

            logAgentEvent(context, 'loop_turn_start', {
                sessionKey: session.sessionKey,
                turn: turnNumber,
                previousResponseId: null,
                inputSummary: summarizeAgentInput(requestBody.input),
                toolDefinitions: toolDefinitions.map(tool => tool.name || tool.server_label || tool.type)
            })

            try {
                finalResponse = await withRetry(params, async attempt => {
                    context.logger.log(`LlmNode agent attempt ${attempt} Responses API ${params.baseUrl}`)
                    return callResponsesApi(requestBody)
                })
            } catch (error: any) {
                throw error
            }

            streamEvents = []
            accumulatedText = getResponseText(finalResponse)
            session.lastResponseId = finalResponse?.id
            session.continuationItems = extractContinuationItems(finalResponse, streamEvents)
            logAgentEvent(context, 'loop_turn_stream_complete', {
                sessionKey: session.sessionKey,
                turn: turnNumber,
                responseId: finalResponse?.id || null,
                responseStatus: finalResponse?.status || null,
                streamEventCount: streamEvents.length,
                accumulatedTextLength: accumulatedText.length,
                continuationItemCount: session.continuationItems.length
            })

            const functionCalls = getFunctionCalls(finalResponse)
            const streamedFunctionCalls = getFunctionCallsFromStreamEvents(streamEvents)
            const functionCallSource = functionCalls.length > 0? 'finalResponse.output': (streamedFunctionCalls.length > 0 ? 'streamEvents' : 'none')
            const effectiveFunctionCalls = functionCalls.length > 0? functionCalls: streamedFunctionCalls
            logAgentEvent(context, 'loop_turn_function_calls', {
                sessionKey: session.sessionKey,
                turn: turnNumber,
                source: functionCallSource,
                count: effectiveFunctionCalls.length,
                names: effectiveFunctionCalls.map(toolCall => String(toolCall?.name || ''))
            })

            if (effectiveFunctionCalls.length === 0) {
                const finalText = getResponseText(finalResponse) || accumulatedText
                if (finalText.trim()) {
                    appendContextMessage(session, {
                        role: 'assistant',
                        content: finalText
                    })
                }
                session.pendingToolOutputs = []
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
                logAgentEvent(context, 'loop_turn_final_text', {
                    sessionKey: session.sessionKey,
                    turn: turnNumber,
                    textLength: finalText.length,
                    preview: finalText.slice(0, 120)
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
                            summary: session.summary,
                            toolTrace: session.toolTrace,
                            lastResponseId: session.lastResponseId,
                            compatibilityMode: session.compatibilityMode,
                            contextMessages: session.contextMessages,
                            continuationItems: session.continuationItems,
                            mcpServers: normalizedMcpServers
                        },
                        raw: {
                            response: finalResponse,
                            streamEvents,
                            requestTools: toolDefinitions,
                            sessionInfo: {
                                sessionKey: session.sessionKey,
                                lastResponseId: session.lastResponseId,
                                compatibilityMode: session.compatibilityMode,
                                contextMessages: session.contextMessages,
                                continuationItems: session.continuationItems,
                                mcpServers: normalizedMcpServers
                            }
                        }
                    }
                }
            }

            const toolOutputs: any[] = []
            for (const toolCall of effectiveFunctionCalls) {
                const tool = toolsByName.get(String(toolCall?.name || ''))
                const { outputItem, trace, toolResult } = await executeToolCall(tool, toolCall, params, context, session, nodeManager)
                const completedTrace = {
                    ...trace,
                    completedAt: new Date().toISOString(),
                    success: toolResult.success,
                    resultPreview: toolResult.content.slice(0, 300),
                    ...(toolResult.error ? { error: toolResult.error } : {})
                }
                session.toolTrace.push(completedTrace as any)
                toolOutputs.push(outputItem)
                appendContextMessage(session, {
                    role: 'tool',
                    toolName: trace.name,
                    content: toolResult.content
                })
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

            session.pendingToolOutputs = toolOutputs.map(output => ({ ...output }))
            nextInput = buildTurnInput(session, toolOutputs)
            logAgentEvent(context, 'loop_turn_tool_outputs_ready', {
                sessionKey: session.sessionKey,
                turn: turnNumber,
                toolOutputCount: toolOutputs.length,
                callIds: toolOutputs.map(output => output?.call_id || null),
                continuationItemCount: session.continuationItems.length,
                compatibilityMode: session.compatibilityMode
            })
            toolTurnCount += 1
        }

        agentSessionManager.save(session)
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
                    requestTools: toolDefinitions,
                    sessionInfo: {
                        sessionKey: session.sessionKey,
                        lastResponseId: session.lastResponseId,
                        compatibilityMode: session.compatibilityMode,
                        contextMessages: session.contextMessages,
                        continuationItems: session.continuationItems,
                        mcpServers: normalizedMcpServers
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
                        errorCode: errorInfo.code,
                        errorName: errorInfo.name,
                        details: errorInfo.details
                    },
                    streamEvents,
                    requestTools: toolDefinitions,
                    sessionInfo: {
                        sessionKey: session.sessionKey,
                        lastResponseId: session.lastResponseId,
                        compatibilityMode: session.compatibilityMode,
                        contextMessages: session.contextMessages,
                        continuationItems: session.continuationItems,
                        mcpServers: normalizedMcpServers
                    }
                }
            }
        }
    }
}
