import type { NodeContext } from '../../types.js'
import type { ZodTypeAny } from 'zod'

export type AgentMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface AgentMessage {
    role: AgentMessageRole
    content: string
    name?: string
    createdAt: string
}

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

export interface AgentSession {
    sessionKey: string
    history: AgentMessage[]
    summary: string
    recentMessages: AgentMessage[]
    toolTrace: AgentToolTrace[]
    lastResponseId?: string
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
}

export interface AgentTool {
    name: string
    description: string
    schema: ZodTypeAny
    execute(args: Record<string, any>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult>
}

export interface AgentMcpServerConfig {
    id: string
    transport?: string
    endpoint?: string
    enabledTools?: string[]
}

export interface AgentSkillConfig {
    id: string
    version?: string
    promptFragment?: string
    enabledTools?: string[]
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
    compressionThreshold: number
    compressionWindow: number
    enabledTools: string[]
    mcpServers: AgentMcpServerConfig[]
    skills: AgentSkillConfig[]
}
