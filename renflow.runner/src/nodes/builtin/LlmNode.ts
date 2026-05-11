import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'
import { fillTextTemplate } from '../../utils/node.js'

/**
 * LLM 节点骨架
 * 当前仅完成节点结构、参数定义和基础输出，后续再接入具体模型调用。
 */
export class LlmNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'llm',
        name: 'LLM 调用',
        description: '调用大语言模型并返回文本结果',
        fullDescription: '用于调用大语言模型完成文本生成、提取、改写等任务。当前版本先支持 OpenAI 的单次提示词请求，其他平台和 Agent 模式先保留配置入口。',
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
        const mode = String(params.mode || 'single')
        const provider = String(params.provider || 'openai')
        const model = String(fillTextTemplate(String(params.model || ''), input, context) || '')
        const prompt = fillTextTemplate(String(params.prompt || ''), input, context)
        const systemPrompt = fillTextTemplate(String(params.systemPrompt || ''), input, context)
        const temperature = Number(params.temperature ?? 0.7)
        const maxTokens = Number(params.maxTokens ?? 1024)
        const baseUrl = fillTextTemplate(String(params.baseUrl || 'https://api.openai.com/v1'), input, context).replace(/\/$/, '')
        const apiKey = fillTextTemplate(String(params.apiKey || ''), input, context)
        const timeout = Math.max(1000, Number(params.timeout ?? 30000))
        const retries = Math.max(0, Number(params.retries ?? 0))

        if (!model) {
            return { success: false, error: '模型不能为空' }
        }

        if (!prompt.trim()) {
            return { success: false, error: '提示词不能为空' }
        }

        if (mode !== 'single') {
            return { success: false, error: `当前暂未实现模式: ${mode}` }
        }

        if (provider !== 'openai') {
            return { success: false, error: `当前仅支持 OpenAI，收到 provider=${provider}` }
        }

        if (!apiKey.trim()) {
            return { success: false, error: 'API Key 不能为空' }
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
                    const errMsg = raw?.error?.message || raw?.rawText || `HTTP ${res.status}`
                    if (attempt <= retries) {
                        await new Promise(resolve => setTimeout(resolve, 200 * attempt))
                        continue
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
