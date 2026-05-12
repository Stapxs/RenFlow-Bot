import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'
import { fillTextTemplate } from '../../utils/node.js'
import { runAgentLlmNode } from './llm-agent/runtime.js'

/**
 * LLM 节点
 * 支持 OpenAI 单次请求，以及基于 Responses API 的 Agent 模式。
 */
export class LlmNode extends BaseNode {
    private buildUpstreamError(raw: any, status?: number, fallbackMessage?: string) {
        const errorObj = raw?.error && typeof raw.error === 'object' ? raw.error : raw
        const message = errorObj?.message
            || errorObj?.detail
            || raw?.rawText
            || fallbackMessage
            || (status ? `HTTP ${status}` : '上游返回错误')
        const retryable = Boolean(errorObj?.retryable)
            || (typeof status === 'number' && status >= 500)
        const retryAfter = Number(errorObj?.retry_after ?? errorObj?.retryAfter ?? 0)
        const code = errorObj?.error_code ?? errorObj?.code ?? null
        const name = errorObj?.error_name ?? errorObj?.type ?? null

        return {
            message: String(message),
            retryable,
            retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
            code,
            name,
            details: errorObj
        }
    }

    private async maybeWaitForRetry(errorInfo: { retryable: boolean; retryAfter: number | null }, attempt: number): Promise<void> {
        const waitMs = errorInfo.retryAfter
            ? Math.max(1000, Math.min(errorInfo.retryAfter * 1000, 120000))
            : 200 * attempt
        await new Promise(resolve => setTimeout(resolve, waitMs))
    }

    private rewriteBaseUrlForProxy(baseUrl: string, context: NodeContext): string {
        const proxyPort = context.globalState?.get('__tauriProxyPort')
        if (!proxyPort) return baseUrl

        try {
            const parsed = new URL(baseUrl)
            const scheme = parsed.protocol.replace(':', '')
            const basePath = parsed.pathname.replace(/\/$/, '')
            return `http://127.0.0.1:${proxyPort}/relay/${scheme}/${parsed.host}${basePath}`
        } catch {
            return baseUrl
        }
    }

    metadata: NodeMetadata = {
        id: 'llm',
        name: 'LLM 调用',
        description: '调用大语言模型并返回文本结果',
        fullDescription: '用于调用大语言模型完成文本生成、提取、改写等任务。当前支持 OpenAI 单次请求，以及带会话、工具和压缩能力的 Agent 模式。',
        category: 'llm',
        icon: 'robot',
        settingsComponent: 'LlmSettings',
        params: [
            {
                key: 'settings',
                label: '',
                type: 'settings'
            },
            {
                pin: true,
                key: 'mode',
                label: '模式',
                type: 'select',
                defaultValue: 'single',
                options: [
                    { label: '单次请求', value: 'single' },
                    { label: 'Agent 模式', value: 'agent' }
                ]
            },
            {
                key: 'provider',
                label: '服务商',
                type: 'select',
                defaultValue: 'openai',
                options: [
                    { label: 'OpenAI', value: 'openai' },
                    { label: 'Anthropic', value: 'anthropic' },
                    { label: 'Gemini', value: 'gemini' },
                    { label: '自定义 OpenAI 兼容', value: 'openai-compatible' }
                ]
            },
            {
                key: 'model',
                label: '模型',
                type: 'input',
                required: true,
                dynamic: true,
                defaultValue: 'gpt-4o-mini',
                placeholder: '输入模型 ID'
            },
            {
                pin: true,
                key: 'prompt',
                label: '用户提示词',
                type: 'textarea',
                required: true,
                dynamic: true,
                placeholder: '输入提示词，支持 {input.xxx} / {nodeId.xxx} 模板'
            },
            {
                key: 'systemPrompt',
                label: '系统提示词',
                type: 'textarea',
                dynamic: true,
                placeholder: '可选，用于约束模型行为'
            },
            {
                key: 'temperature',
                label: '温度',
                type: 'number',
                defaultValue: 0.7,
                placeholder: '0 ~ 2'
            },
            {
                key: 'maxTokens',
                label: '最大输出 Tokens',
                type: 'number',
                defaultValue: 1024,
                placeholder: '留空则由后端决定'
            },
            {
                key: 'baseUrl',
                label: 'Base URL',
                type: 'input',
                dynamic: true,
                placeholder: '可选，自定义接口地址'
            },
            {
                key: 'apiKey',
                label: 'API Key',
                type: 'input',
                dynamic: true,
                required: true,
                placeholder: '输入 OpenAI API Key'
            },
            {
                key: 'timeout',
                label: '超时(ms)',
                type: 'number',
                defaultValue: 30000,
                placeholder: '默认 30000'
            },
            {
                key: 'retries',
                label: '重试次数',
                type: 'number',
                defaultValue: 0,
                placeholder: '失败后自动重试次数'
            },
            {
                key: 'sessionKey',
                label: 'Session Key',
                type: 'input',
                dynamic: true,
                placeholder: 'Agent 模式必填，用于会话复用',
                visibleWhen: { key: 'mode', value: 'agent' }
            },
            {
                key: 'maxTurns',
                label: '最大轮数',
                type: 'number',
                defaultValue: 8,
                placeholder: 'Agent tool loop 最大轮数',
                visibleWhen: { key: 'mode', value: 'agent' }
            },
            {
                key: 'compressionThreshold',
                label: '压缩阈值',
                type: 'number',
                defaultValue: 12,
                placeholder: '达到多少条消息后压缩',
                visibleWhen: { key: 'mode', value: 'agent' }
            },
            {
                key: 'compressionWindow',
                label: '保留窗口',
                type: 'number',
                defaultValue: 6,
                placeholder: '压缩后保留最近消息数',
                visibleWhen: { key: 'mode', value: 'agent' }
            },
            {
                key: 'enabledTools',
                label: '启用工具(JSON)',
                type: 'textarea',
                defaultValue: '["http_request","get_system_info","get_time"]',
                placeholder: '例如 ["http_request","get_time"]',
                visibleWhen: { key: 'mode', value: 'agent' }
            },
            {
                key: 'mcpServers',
                label: 'MCP Servers(JSON)',
                type: 'textarea',
                defaultValue: '[]',
                placeholder: '[{"id":"docs","transport":"http","endpoint":"https://example.com/mcp"}]',
                visibleWhen: { key: 'mode', value: 'agent' }
            },
            {
                key: 'skills',
                label: 'Skills(JSON)',
                type: 'textarea',
                defaultValue: '[]',
                placeholder: '[{"id":"summarizer","version":"1.0.0"}]',
                visibleWhen: { key: 'mode', value: 'agent' }
            }
        ],
        outputSchema: [
            {
                key: 'text',
                label: '文本结果',
                type: 'string',
                description: '模型输出的主文本内容'
            },
            {
                key: 'model',
                label: '使用模型',
                type: 'string',
                description: '实际使用的模型标识'
            },
            {
                key: 'provider',
                label: '服务商',
                type: 'string',
                description: '实际使用的服务商标识'
            },
            {
                key: 'usage',
                label: '用量信息',
                type: 'object',
                description: '后续用于记录 prompt/completion token 等统计'
            },
            {
                key: 'sessionInfo',
                label: '会话信息',
                type: 'object',
                description: 'Agent 模式下返回会话状态、摘要、tool trace 与占位配置'
            },
            {
                key: 'raw',
                label: '原始响应',
                type: 'any',
                description: '后续用于保留底层接口返回值'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const parseJsonField = <T>(raw: any, fallback: T, label: string): { ok: true; value: T } | { ok: false; error: string } => {
            if (raw === undefined || raw === null || raw === '') {
                return { ok: true, value: fallback }
            }
            if (typeof raw !== 'string') {
                return { ok: true, value: raw as T }
            }
            try {
                return { ok: true, value: JSON.parse(raw) as T }
            } catch (error: any) {
                return { ok: false, error: `${label} 不是合法的 JSON: ${error?.message || String(error)}` }
            }
        }

        const mode = String(params.mode || 'single')
        const provider = String(params.provider || 'openai')
        const model = String(fillTextTemplate(String(params.model || ''), input, context) || '')
        const prompt = fillTextTemplate(String(params.prompt || ''), input, context)
        const systemPrompt = fillTextTemplate(String(params.systemPrompt || ''), input, context)
        const temperature = Number(params.temperature ?? 0.7)
        const maxTokens = Number(params.maxTokens ?? 1024)
        const rawBaseUrl = fillTextTemplate(String(params.baseUrl || 'https://api.openai.com/v1'), input, context).replace(/\/$/, '')
        const baseUrl = this.rewriteBaseUrlForProxy(rawBaseUrl, context)
        const apiKey = fillTextTemplate(String(params.apiKey || ''), input, context)
        const timeout = Math.max(1000, Number(params.timeout ?? 30000))
        const retries = Math.max(0, Number(params.retries ?? 0))
        const sessionKey = fillTextTemplate(String(params.sessionKey || ''), input, context)
        const maxTurns = Math.max(1, Number(params.maxTurns ?? 8))
        const compressionThreshold = Math.max(2, Number(params.compressionThreshold ?? 12))
        const compressionWindow = Math.max(1, Number(params.compressionWindow ?? 6))

        const enabledToolsParsed = parseJsonField<string[]>(params.enabledTools ?? '["http_request","get_system_info","get_time"]', ['http_request', 'get_system_info', 'get_time'], 'enabledTools')
        if (!enabledToolsParsed.ok) return { success: false, error: enabledToolsParsed.error }
        const mcpServersParsed = parseJsonField<any[]>(params.mcpServers ?? '[]', [], 'mcpServers')
        if (!mcpServersParsed.ok) return { success: false, error: mcpServersParsed.error }
        const skillsParsed = parseJsonField<any[]>(params.skills ?? '[]', [], 'skills')
        if (!skillsParsed.ok) return { success: false, error: skillsParsed.error }

        if (!model) {
            return { success: false, error: '模型不能为空' }
        }

        if (!prompt.trim()) {
            return { success: false, error: '提示词不能为空' }
        }

        if (!apiKey.trim()) {
            return { success: false, error: 'API Key 不能为空' }
        }

        if (mode === 'agent') {
            return runAgentLlmNode({
                provider,
                model,
                prompt,
                systemPrompt,
                apiKey,
                baseUrl: rawBaseUrl,
                temperature,
                maxTokens,
                timeout,
                retries,
                sessionKey,
                maxTurns,
                compressionThreshold,
                compressionWindow,
                enabledTools: Array.isArray(enabledToolsParsed.value) ? enabledToolsParsed.value.map(item => String(item)) : [],
                mcpServers: Array.isArray(mcpServersParsed.value) ? mcpServersParsed.value : [],
                skills: Array.isArray(skillsParsed.value) ? skillsParsed.value : []
            }, context)
        }

        if (mode !== 'single') {
            return { success: false, error: `当前暂未实现模式: ${mode}` }
        }

        if (provider !== 'openai') {
            return { success: false, error: `当前仅支持 OpenAI，收到 provider=${provider}` }
        }

        const body = {
            model,
            messages: [
                ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: prompt }
            ],
            temperature,
            max_tokens: maxTokens
        }

        const start = Date.now()
        for (let attempt = 1; attempt <= retries + 1; attempt++) {
            const ac = new AbortController()
            const timer = setTimeout(() => ac.abort(), timeout)

            try {
                context.logger.log(`LlmNode attempt ${attempt} POST ${baseUrl}/chat/completions`)

                // @ts-ignore runtime global
                const res = await (globalThis as any).fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body),
                    signal: ac.signal
                })
                clearTimeout(timer)

                const raw = await res.json().catch(async () => {
                    const text = await res.text()
                    return { rawText: text }
                })

                if (!res.ok) {
                    const errorInfo = this.buildUpstreamError(raw, res.status)
                    if (attempt <= retries && errorInfo.retryable) {
                        await this.maybeWaitForRetry(errorInfo, attempt)
                        continue
                    }
                    return {
                        success: false,
                        error: `LLM 请求失败: ${errorInfo.message}`,
                        output: {
                            text: '',
                            model,
                            provider,
                            usage: raw?.usage || null,
                            sessionInfo: null,
                            raw: {
                                request: body,
                                response: raw,
                                status: res.status,
                                retryable: errorInfo.retryable,
                                retryAfter: errorInfo.retryAfter,
                                errorCode: errorInfo.code,
                                errorName: errorInfo.name,
                                duration: Date.now() - start
                            }
                        }
                    }
                }

                if (raw?.error) {
                    const errorInfo = this.buildUpstreamError(raw, res.status)
                    if (attempt <= retries && errorInfo.retryable) {
                        await this.maybeWaitForRetry(errorInfo, attempt)
                        continue
                    }
                    return {
                        success: false,
                        error: `LLM 请求失败: ${errorInfo.message}`,
                        output: {
                            text: '',
                            model,
                            provider,
                            usage: raw?.usage || null,
                            sessionInfo: null,
                            raw: {
                                request: body,
                                response: raw,
                                status: res.status,
                                retryable: errorInfo.retryable,
                                retryAfter: errorInfo.retryAfter,
                                errorCode: errorInfo.code,
                                errorName: errorInfo.name,
                                duration: Date.now() - start
                            }
                        }
                    }
                }

                const text = raw?.choices?.[0]?.message?.content
                const normalizedText = Array.isArray(text)
                    ? text.map((item: any) => item?.text || '').join('')
                    : String(text || '')

                return {
                    success: true,
                    output: {
                        text: normalizedText,
                        model: raw?.model || model,
                        provider: provider,
                        usage: raw?.usage || null,
                        sessionInfo: null,
                        raw
                    }
                }
            } catch (err: any) {
                clearTimeout(timer)
                if (attempt <= retries) {
                    await new Promise(resolve => setTimeout(resolve, 200 * attempt))
                    continue
                }

                return {
                    success: false,
                    error: `LLM 请求失败: ${err?.message || String(err)}`,
                    output: {
                        text: '',
                        model,
                        provider,
                        usage: null,
                        sessionInfo: null,
                        raw: {
                            request: body,
                            duration: Date.now() - start
                        }
                    }
                }
            }
        }

        return {
            success: false,
            error: 'LLM 请求失败: 未知错误'
        }
    }
}

export default LlmNode
