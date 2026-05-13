import test from 'node:test'
import assert from 'node:assert/strict'

import { LlmNode } from './LlmNode.js'

test('LlmNode agent metadata removes legacy skills/compression params', () => {
    const node = new LlmNode()
    const keys = node.metadata.params.map(param => param.key)

    assert.equal(keys.includes('skills'), false)
    assert.equal(keys.includes('compressionThreshold'), false)
    assert.equal(keys.includes('compressionWindow'), false)
    assert.equal(keys.includes('mcpServers'), true)
})

test('LlmNode agent mode forwards normalized params to runtime factory', async () => {
    const node = new LlmNode()
    const calls: any[] = []
    const context = {
        nodeId: 'node-1',
        nodeType: 'llm',
        globalState: new Map([
            ['__agentOpenAIClientFactory', () => ({
                responses: {
                    create: async (body: any) => {
                        calls.push(body)
                        return {
                            id: 'resp-1',
                            model: 'gpt-4o-mini',
                            output: [
                                {
                                    id: 'msg-1',
                                    type: 'message',
                                    content: [
                                        {
                                            type: 'output_text',
                                            text: 'ok'
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            })]
        ]),
        logger: {
            log: () => {},
            warn: () => {},
            error: () => {}
        }
    }

    const result = await node.execute({}, {
        mode: 'agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'hello',
        systemPrompt: 'system',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        timeout: 30000,
        retries: 0,
        sessionKey: 'session-1',
        maxTurns: 2,
        enabledTools: '["get_time"]',
        mcpServers: '[{"serverLabel":"docs","serverUrl":"https://example.com/mcp"}]'
    }, context as any)

    assert.equal(result.success, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].tools[1].server_label, 'docs')
    assert.equal(calls[0].tools[1].require_approval, 'always')
})

test('LlmNode single mode retries non-200 responses and returns upstream message body', async () => {
    const node = new LlmNode()
    const responses = [
        new Response(JSON.stringify({ error: { message: 'first failure' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        }),
        new Response(JSON.stringify({ error: { message: 'final failure' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        })
    ]
    const originalFetch = globalThis.fetch
    let callCount = 0
    globalThis.fetch = (async () => {
        callCount += 1
        const next = responses.shift()
        assert.ok(next)
        return next
    }) as typeof fetch

    try {
        const result = await node.execute({}, {
            mode: 'single',
            provider: 'openai',
            model: 'gpt-4o-mini',
            prompt: 'hello',
            apiKey: 'test-key',
            retries: 1,
            timeout: 30000
        }, {
            nodeId: 'node-1',
            nodeType: 'llm',
            globalState: new Map(),
            logger: {
                log: () => {},
                warn: () => {},
                error: () => {}
            }
        } as any)

        assert.equal(callCount, 2)
        assert.equal(result.success, false)
        assert.equal(result.error, 'LLM 请求失败: final failure')
    } finally {
        globalThis.fetch = originalFetch
    }
})
