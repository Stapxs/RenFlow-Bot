import type { NodeContext, NodeMetadata, NodeExecutionResult } from '../../types.js'
import type { NodeManager } from '../../NodeManager.js'
import type { ZodTypeAny } from 'zod'

export interface AgentToolTrace {
    id: string
    name: string
    args: Record<string, any>
    startedAt: string
    completedAt?: string
    success?: boolean
    resultPreview?: string
    error?: string
}

export interface AgentMcpSessionState {
    serverLabel: string
    serverUrl: string
    sessionId?: string
    initialized: boolean
    updatedAt: string
}

export interface AgentSession {
    sessionKey: string
    lastResponseId?: string
    continuationItems: AgentContinuationItem[]
    pendingToolOutputs: Array<Record<string, any>>
    contextMessages: AgentContextMessage[]
    compatibilityMode: 'stateful' | 'stateless'
    summary: string
    toolTrace: AgentToolTrace[]
    mcpSessions: Record<string, AgentMcpSessionState>
    updatedAt: string
}

export interface AgentSessionStorage {
    get(sessionKey: string): AgentSession | undefined
    set(session: AgentSession): void
}

export interface AgentToolExecutionResult {
    success: boolean
    content: string
    structured?: any
    error?: string
}

export interface AgentToolExecutionContext {
    sessionKey: string
    nodeContext: NodeContext
    timeout: number
    nodeManager: NodeManager
}

export interface AgentContinuationItem {
    type: string
    [key: string]: any
}

export interface AgentContextMessage {
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolName?: string
}

export interface AgentTool {
    name: string
    description: string
    schema: ZodTypeAny
    parametersSchema?: Record<string, any>
    strict?: boolean
    execute(args: Record<string, any>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult>
}

export interface AgentNodeDescriptor {
    nodeType: string
    name: string
    description: string
    category: string
    params: NodeMetadata['params']
    outputSchema?: NodeMetadata['outputSchema']
}

export interface AgentNodeExecutionStructuredResult {
    success: boolean
    nodeType: string
    nodeName: string
    input: any
    params: Record<string, any>
    output?: any
    error?: string
    raw: NodeExecutionResult
}

export interface AgentMcpServerConfig {
    serverLabel: string
    serverUrl: string
    allowedTools?: string[]
    requireApproval?: 'always' | 'never'
    headers?: Record<string, string>
    enabled?: boolean
}

export interface AgentRuntimeCallbacks {
    onAgentSessionStart?: (payload: Record<string, any>) => void
    onAgentToken?: (payload: Record<string, any>) => void
    onAgentToolCallStart?: (payload: Record<string, any>) => void
    onAgentToolCallComplete?: (payload: Record<string, any>) => void
    onAgentCompression?: (payload: Record<string, any>) => void
    onAgentSessionComplete?: (payload: Record<string, any>) => void
}

export interface AgentRuntimeParams {
    provider: string
    model: string
    prompt: string
    systemPrompt: string
    apiKey: string
    baseUrl: string
    temperature: number
    maxTokens: number
    timeout: number
    retries: number
    sessionKey: string
    maxTurns: number
    enabledTools: string[]
    mcpServers: AgentMcpServerConfig[]
}
