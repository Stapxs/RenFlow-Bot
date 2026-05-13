import type { AgentSession, AgentSessionStorage } from './types.js'

class InMemoryAgentSessionStorage implements AgentSessionStorage {
    private readonly sessions = new Map<string, AgentSession>()

    get(sessionKey: string): AgentSession | undefined {
        return this.sessions.get(sessionKey)
    }

    set(session: AgentSession): void {
        this.sessions.set(session.sessionKey, session)
    }
}

export class AgentSessionManager {
    constructor(private readonly storage: AgentSessionStorage = new InMemoryAgentSessionStorage()) {}

    get(sessionKey: string): AgentSession {
        const existing = this.storage.get(sessionKey)
        if (existing) return existing

        const session: AgentSession = {
            sessionKey,
            continuationItems: [],
            pendingToolOutputs: [],
            contextMessages: [],
            compatibilityMode: 'stateless',
            summary: '',
            toolTrace: [],
            mcpSessions: {},
            updatedAt: new Date().toISOString()
        }
        this.storage.set(session)
        return session
    }

    save(session: AgentSession): void {
        session.updatedAt = new Date().toISOString()
        this.storage.set(session)
    }
}

export const agentSessionManager = new AgentSessionManager()
