import test from 'node:test'
import assert from 'node:assert/strict'

import { runAgentLlmNode } from './runtime.js'

type MockResponse = {
    response: any
}

let sessionCounter = 0

function createFetchResponse(body: any, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            'content-type': 'application/json',
            ...(init?.headers || {})
        },
        ...init
    })
}

function createContext(responsesQueue: MockResponse[], calls: any[]) {
    return {
        nodeId: 'node-1',
        nodeType: 'llm',
        globalState: new Map<string, any>([
            ['__agentNodeManager', {
                getNodeList: () => [],
                getNodeMetadata: () => null,
                executeNode: async () => ({ success: false, error: 'not implemented in runtime test' })
            }],
            ['__agentOpenAIResponsesCreate', async (body: any) => {
                calls.push(body)
                const next = responsesQueue.shift()
                assert.ok(next, 'unexpected extra responses.create call')
                return next.response
            }]
        ]),
        logger: {
            log: () => {},
            warn: () => {},
            error: () => {}
        }
    }
}

function createBaseParams(overrides: Record<string, any> = {}) {
    sessionCounter += 1
    return {
        provider: 'openai',
        model: 'gpt-5.4',
        prompt: '现在是什么时候呢',
        systemPrompt: '你是一个测试助手',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0.7,
        maxTokens: 1024,
        timeout: 30000,
        retries: 0,
        sessionKey: `session-${sessionCounter}`,
        maxTurns: 3,
        enabledTools: ['get_time'],
        mcpServers: [],
        ...overrides
    }
}

test('runAgentLlmNode continues tool loop with stateless continuation items', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-5.4',
                output: [
                    {
                        id: 'rs-1',
                        type: 'reasoning',
                        encrypted_content: 'encrypted-reasoning'
                    },
                    {
                        id: 'fc-1',
                        type: 'function_call',
                        call_id: 'call-1',
                        name: 'get_time',
                        arguments: '{"timeZone":"Asia/Shanghai"}',
                        status: 'completed'
                    }
                ],
                usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
            }
        },
        {
            response: {
                id: 'resp-2',
                model: 'gpt-5.4',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: '现在是测试时间。'
                            }
                        ]
                    }
                ],
                usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 }
            }
        }
    ]

    const calls: any[] = []
    const result = await runAgentLlmNode(createBaseParams(), createContext(responsesQueue, calls) as any)

    assert.equal(result.success, true)
    assert.equal(result.output?.text, '现在是测试时间。')
    assert.equal(calls.length, 2)
    assert.equal(calls[0].temperature, undefined)
    assert.equal(calls[1].previous_response_id, undefined)
    assert.equal(Array.isArray(calls[1].input), true)
    assert.equal(calls[1].input[0]?.type, 'message')
    assert.equal(calls[1].input[1]?.type, 'message')
    assert.equal(calls[1].input[2]?.type, 'function_call_output')
    assert.equal(calls[1].input[2]?.call_id, 'call-1')
    assert.match(String(calls[1].input[2].output), /Asia\/Shanghai/)
    assert.equal(result.output?.sessionInfo?.lastResponseId, 'resp-2')
    assert.equal(result.output?.sessionInfo?.compatibilityMode, 'stateless')
})

test('runAgentLlmNode continues tool loop from final response output without streaming', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'fc-1',
                        type: 'function_call',
                        call_id: 'call-1',
                        name: 'get_time',
                        arguments: '{"timeZone":"Asia/Shanghai"}',
                        status: 'completed'
                    }
                ],
                usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
            }
        },
        {
            response: {
                id: 'resp-2',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: '现在是测试时间。'
                            }
                        ]
                    }
                ],
                usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 }
            }
        }
    ]

    const calls: any[] = []
    const result = await runAgentLlmNode({
        ...createBaseParams(),
        model: 'gpt-4o-mini'
    }, createContext(responsesQueue, calls) as any)

    assert.equal(result.success, true)
    assert.equal(result.output?.text, '现在是测试时间。')
    assert.equal(calls[0].temperature, 0.7)
    assert.equal(calls[1].previous_response_id, undefined)
    assert.equal(calls[1].input[0]?.type, 'message')
    assert.equal(calls[1].input.some((item: any) => item?.type === 'function_call'), false)
    assert.ok(calls[1].input.some((item: any) => item?.type === 'function_call_output'))
})

test('runAgentLlmNode resolves local MCP tools into function tools', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: 'MCP configured'
                            }
                        ]
                    }
                ]
            }
        }
    ]
    const calls: any[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.method === 'initialize') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: { protocolVersion: '2024-11-05', capabilities: {} }
            })
        }
        if (body.method === 'notifications/initialized') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: {}
            })
        }
        if (body.method === 'tools/list') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    tools: [
                        {
                            name: 'search',
                            description: 'search docs',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    q: { type: 'string' }
                                },
                                required: ['q'],
                                additionalProperties: false
                            }
                        }
                    ]
                }
            })
        }
        throw new Error(`unexpected MCP method: ${body.method}`)
    }) as typeof fetch

    try {
        const result = await runAgentLlmNode({
            ...createBaseParams(),
            model: 'gpt-4o-mini',
            mcpServers: [
                {
                    serverLabel: 'docs',
                    serverUrl: 'https://example.com/mcp',
                    allowedTools: ['search'],
                    headers: { Authorization: 'Bearer token' }
                }
            ]
        }, createContext(responsesQueue, calls) as any)

        assert.equal(result.success, true)
        assert.equal(calls.length, 1)
        assert.equal(calls[0].tools[1].type, 'function')
        assert.equal(calls[0].tools[1].name, 'mcp__docs__search')
        assert.equal(calls[0].tools[1].description, 'search docs')
        assert.deepEqual(calls[0].tools[1].parameters.properties, {
            q: { type: 'string' }
        })
        assert.deepEqual(calls[0].tools[1].parameters.required, ['q'])
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('runAgentLlmNode filters disabled and invalid MCP servers before local resolution', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: 'MCP normalized'
                            }
                        ]
                    }
                ]
            }
        }
    ]
    const calls: any[] = []
    const originalFetch = globalThis.fetch
    const seenUrls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        seenUrls.push(String(input))
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.method === 'initialize' || body.method === 'notifications/initialized') {
            return createFetchResponse({ jsonrpc: '2.0', id: body.id, result: {} })
        }
        if (body.method === 'tools/list') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    tools: [
                        { name: 'search', description: 'search docs', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
                    ]
                }
            })
        }
        throw new Error(`unexpected MCP method: ${body.method}`)
    }) as typeof fetch

    try {
        const result = await runAgentLlmNode({
            ...createBaseParams(),
            model: 'gpt-4o-mini',
            mcpServers: [
                {
                    serverLabel: 'disabled',
                    serverUrl: 'https://disabled.example.com/mcp',
                    enabled: false
                },
                {
                    serverLabel: '',
                    serverUrl: 'https://invalid.example.com/mcp'
                },
                {
                    serverLabel: ' docs ',
                    serverUrl: ' https://example.com/mcp ',
                    requireApproval: 'never',
                    allowedTools: [],
                    headers: {
                        Authorization: 'Bearer token',
                        '': 'ignored',
                        'X-Test': '1'
                    }
                }
            ]
        }, createContext(responsesQueue, calls) as any)

        assert.equal(result.success, true)
        assert.equal(calls.length, 1)
        const mcpTools = calls[0].tools.filter((tool: any) => tool.name?.startsWith('mcp__'))
        assert.equal(mcpTools.length, 1)
        assert.equal(mcpTools[0].name, 'mcp__docs__search')
        assert.deepEqual(seenUrls, ['https://example.com/mcp', 'https://example.com/mcp', 'https://example.com/mcp'])
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('runAgentLlmNode executes local MCP tool through tools/call', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'fc-1',
                        type: 'function_call',
                        call_id: 'call-1',
                        name: 'mcp__docs__search',
                        arguments: '{"q":"hello"}',
                        status: 'completed'
                    }
                ]
            }
        },
        {
            response: {
                id: 'resp-2',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: 'done'
                            }
                        ]
                    }
                ]
            }
        }
    ]
    const calls: any[] = []
    const originalFetch = globalThis.fetch
    const mcpMethods: string[] = []
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'))
        mcpMethods.push(body.method)
        if (body.method === 'initialize' || body.method === 'notifications/initialized') {
            return createFetchResponse({ jsonrpc: '2.0', id: body.id, result: {} })
        }
        if (body.method === 'tools/list') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    tools: [
                        {
                            name: 'search',
                            description: 'search docs',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    q: { type: 'string' }
                                },
                                required: ['q'],
                                additionalProperties: false
                            }
                        }
                    ]
                }
            })
        }
        if (body.method === 'tools/call') {
            assert.equal(body.params.name, 'search')
            assert.deepEqual(body.params.arguments, { q: 'hello' })
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: { content: [{ type: 'text', text: 'world' }] }
            })
        }
        throw new Error(`unexpected MCP method: ${body.method}`)
    }) as typeof fetch

    try {
        const result = await runAgentLlmNode({
            ...createBaseParams(),
            model: 'gpt-4o-mini',
            enabledTools: [],
            mcpServers: [
                {
                    serverLabel: 'docs',
                    serverUrl: 'https://example.com/mcp'
                }
            ]
        }, createContext(responsesQueue, calls) as any)

        assert.equal(result.success, true)
        assert.deepEqual(mcpMethods, ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'])
        const toolOutputItem = calls[1].input.find((item: any) => item?.type === 'function_call_output')
        assert.ok(toolOutputItem)
        assert.match(String(toolOutputItem.output), /world/)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('runAgentLlmNode reuses MCP session id returned by initialize response', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'fc-1',
                        type: 'function_call',
                        call_id: 'call-1',
                        name: 'mcp__docs__search',
                        arguments: '{"q":"hello"}',
                        status: 'completed'
                    }
                ]
            }
        },
        {
            response: {
                id: 'resp-2',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: 'done'
                            }
                        ]
                    }
                ]
            }
        }
    ]
    const calls: any[] = []
    const originalFetch = globalThis.fetch
    const seenSessionHeaders: Array<string | null> = []

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'))
        const headers = init?.headers as Record<string, string> | undefined
        seenSessionHeaders.push(headers?.['Mcp-Session-Id'] || headers?.['mcp-session-id'] || null)

        if (body.method === 'initialize') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: { protocolVersion: '2024-11-05', capabilities: {} }
            }, {
                headers: {
                    'content-type': 'application/json',
                    'mcp-session-id': 'mcp-session-1'
                }
            })
        }
        if (body.method === 'notifications/initialized') {
            return createFetchResponse({ jsonrpc: '2.0', id: body.id, result: {} })
        }
        if (body.method === 'tools/list') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    tools: [
                        {
                            name: 'search',
                            description: 'search docs',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    q: { type: 'string' }
                                },
                                required: ['q'],
                                additionalProperties: false
                            }
                        }
                    ]
                }
            })
        }
        if (body.method === 'tools/call') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: { content: [{ type: 'text', text: 'world' }] }
            })
        }
        throw new Error(`unexpected MCP method: ${body.method}`)
    }) as typeof fetch

    try {
        const result = await runAgentLlmNode({
            ...createBaseParams(),
            model: 'gpt-4o-mini',
            enabledTools: [],
            mcpServers: [
                {
                    serverLabel: 'docs',
                    serverUrl: 'https://example.com/mcp'
                }
            ]
        }, createContext(responsesQueue, calls) as any)

        assert.equal(result.success, true)
        assert.deepEqual(seenSessionHeaders, [null, 'mcp-session-1', 'mcp-session-1', 'mcp-session-1'])
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('runAgentLlmNode sends notifications/initialized without jsonrpc id', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: 'done'
                            }
                        ]
                    }
                ]
            }
        }
    ]
    const calls: any[] = []
    const originalFetch = globalThis.fetch
    let notificationBody: any = null

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.method === 'initialize') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: { protocolVersion: '2024-11-05', capabilities: {} }
            }, {
                headers: {
                    'content-type': 'application/json',
                    'mcp-session-id': 'mcp-session-1'
                }
            })
        }
        if (body.method === 'notifications/initialized') {
            notificationBody = body
            return new Response('', { status: 202 })
        }
        if (body.method === 'tools/list') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    tools: []
                }
            })
        }
        throw new Error(`unexpected MCP method: ${body.method}`)
    }) as typeof fetch

    try {
        const result = await runAgentLlmNode({
            ...createBaseParams({
                model: 'gpt-4o-mini',
                enabledTools: [],
                mcpServers: [
                    {
                        serverLabel: 'docs',
                        serverUrl: 'https://example.com/mcp'
                    }
                ]
            })
        }, createContext(responsesQueue, calls) as any)

        assert.equal(result.success, true)
        assert.ok(notificationBody)
        assert.equal(notificationBody.jsonrpc, '2.0')
        assert.equal('id' in notificationBody, false)
        assert.equal(notificationBody.method, 'notifications/initialized')
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('runAgentLlmNode returns standard function_call_output error for disabled tools', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'fc-1',
                        type: 'function_call',
                        call_id: 'call-1',
                        name: 'http_request',
                        arguments: '{"url":"https://example.com"}',
                        status: 'completed'
                    }
                ]
            }
        },
        {
            response: {
                id: 'resp-2',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: '工具不可用'
                            }
                        ]
                    }
                ]
            }
        }
    ]
    const calls: any[] = []

    const result = await runAgentLlmNode({
        ...createBaseParams(),
        model: 'gpt-4o-mini',
        enabledTools: ['get_time']
    }, createContext(responsesQueue, calls) as any)

    assert.equal(result.success, true)
    const toolOutputItem = calls[1].input.find((item: any) => item?.type === 'function_call_output')
    assert.ok(toolOutputItem)
    assert.match(String(toolOutputItem.output), /未启用工具: http_request/)
})

test('runAgentLlmNode uses stateless context replay by default', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'fc-1',
                        type: 'function_call',
                        call_id: 'call-1',
                        name: 'get_time',
                        arguments: '{"timeZone":"Asia/Shanghai"}',
                        status: 'completed'
                    }
                ]
            }
        },
        {
            response: {
                id: 'resp-2',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: 'stateless success'
                            }
                        ]
                    }
                ]
            }
        }
    ]
    const calls: any[] = []

    const result = await runAgentLlmNode({
        ...createBaseParams(),
        model: 'gpt-4o-mini'
    }, createContext(responsesQueue, calls) as any)

    assert.equal(result.success, true)
    assert.equal(result.output?.text, 'stateless success')
    assert.equal(calls.length, 2)
    assert.equal(calls[1].previous_response_id, undefined)
    assert.equal(Array.isArray(calls[1].input), true)
    assert.equal(calls[1].input.some((item: any) => item?.type === 'function_call'), false)
    assert.equal(calls[1].input.some((item: any) => item?.type === 'reasoning'), false)
    assert.equal(calls[1].input[0]?.type, 'message')
    assert.equal(calls[1].input[1]?.content?.[0]?.type, 'output_text')
    const toolOutputItem = calls[1].input.find((item: any) => item?.type === 'function_call_output')
    assert.ok(toolOutputItem)
    assert.equal(toolOutputItem.call_id, 'call-1')
    assert.match(String(toolOutputItem.output), /Asia\/Shanghai/)
    assert.equal(result.output?.sessionInfo?.compatibilityMode, 'stateless')
})

test('runAgentLlmNode tolerates concatenated JSON in tool arguments by using the last valid object', async () => {
    const responsesQueue: MockResponse[] = [
        {
            response: {
                id: 'resp-1',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'fc-1',
                        type: 'function_call',
                        call_id: 'call-1',
                        name: 'mcp__docs__search',
                        arguments: '{}{"q":"hello"}',
                        status: 'completed'
                    }
                ]
            }
        },
        {
            response: {
                id: 'resp-2',
                model: 'gpt-4o-mini',
                output: [
                    {
                        id: 'msg-1',
                        type: 'message',
                        content: [
                            {
                                type: 'output_text',
                                text: 'done'
                            }
                        ]
                    }
                ]
            }
        }
    ]
    const calls: any[] = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.method === 'initialize') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: { protocolVersion: '2024-11-05', capabilities: {} }
            })
        }
        if (body.method === 'notifications/initialized') {
            return new Response('', { status: 202 })
        }
        if (body.method === 'tools/list') {
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    tools: [
                        {
                            name: 'search',
                            description: 'search docs',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    q: { type: 'string' }
                                },
                                required: ['q'],
                                additionalProperties: false
                            }
                        }
                    ]
                }
            })
        }
        if (body.method === 'tools/call') {
            assert.deepEqual(body.params.arguments, { q: 'hello' })
            return createFetchResponse({
                jsonrpc: '2.0',
                id: body.id,
                result: { content: [{ type: 'text', text: 'world' }] }
            })
        }
        throw new Error(`unexpected MCP method: ${body.method}`)
    }) as typeof fetch

    try {
        const result = await runAgentLlmNode({
            ...createBaseParams({
                model: 'gpt-4o-mini',
                enabledTools: [],
                mcpServers: [
                    {
                        serverLabel: 'docs',
                        serverUrl: 'https://example.com/mcp'
                    }
                ]
            })
        }, createContext(responsesQueue, calls) as any)

        assert.equal(result.success, true)
    } finally {
        globalThis.fetch = originalFetch
    }
})
