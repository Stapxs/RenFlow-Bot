import type { AgentMessage, AgentSession, AgentSessionStorage } from './types.js'

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
            history: [],
            summary: '',
            recentMessages: [],
            toolTrace: [],
            updatedAt: new Date().toISOString()
        }
        this.storage.set(session)
        return session
    }

    appendMessage(session: AgentSession, message: Omit<AgentMessage, 'createdAt'> & { createdAt?: string }): void {
        const normalized: AgentMessage = {
            ...message,
            createdAt: message.createdAt || new Date().toISOString()
        }
        session.history.push(normalized)
        session.recentMessages.push(normalized)
        session.updatedAt = new Date().toISOString()
    }

    save(session: AgentSession): void {
        session.updatedAt = new Date().toISOString()
        this.storage.set(session)
    }
}

export const agentSessionManager = new AgentSessionManager()
