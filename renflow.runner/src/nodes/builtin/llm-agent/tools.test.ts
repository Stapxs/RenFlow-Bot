import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'

import { NodeManager } from '../../NodeManager.js'
import { builtinAgentTools, getBuiltinAgentTools } from './tools.js'

const baseContext = {
    sessionKey: 'test-session',
    nodeContext: {
        nodeId: 'node-1',
        nodeType: 'llm',
        globalState: new Map(),
        logger: {
            log: () => {},
            warn: () => {},
            error: () => {}
        }
    },
    timeout: 100,
    nodeManager: new NodeManager()
}

function getTool(name: string) {
    const tool = builtinAgentTools.find(item => item.name === name)
    assert.ok(tool, `tool not found: ${name}`)
    return tool
}

test('getBuiltinAgentTools only returns enabled tools', () => {
    const tools = getBuiltinAgentTools(['get_time', 'http_request'])
    assert.deepEqual(
        tools.map(tool => tool.name).sort(),
        ['get_time', 'http_request']
    )
})

test('http_request schema validates url and defaults method', () => {
    const tool = getTool('http_request')
    const parsed = tool.schema.parse({ url: 'https://example.com' }) as Record<string, any>
    assert.equal(parsed.url, 'https://example.com')
    assert.equal(parsed.method, 'GET')

    assert.throws(() => {
        tool.schema.parse({ url: 'not-a-url' })
    })
})

test('http_request executes with query params and json body', async () => {
    const tool = getTool('http_request')
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(input)
        capturedInit = init
        return new Response(JSON.stringify({ ok: true, echoed: true }), {
            status: 201,
            headers: { 'content-type': 'application/json', 'x-test': 'yes' }
        })
    }) as typeof fetch

    try {
        const result = await tool.execute(tool.schema.parse({
            url: 'https://example.com/api',
            query: { q: 'hello', page: 2, tags: ['a', 'b'] },
            method: 'POST',
            body: { hi: 'world' }
        }) as Record<string, any>, baseContext)

        assert.equal(result.success, true)
        assert.match(capturedUrl, /^https:\/\/example\.com\/api\?/)
        assert.match(capturedUrl, /q=hello/)
        assert.match(capturedUrl, /page=2/)
        assert.match(capturedUrl, /tags=a/)
        assert.match(capturedUrl, /tags=b/)
        assert.equal(capturedInit?.method, 'POST')
        assert.equal((capturedInit?.headers as Record<string, string>)['Content-Type'], 'application/json')
        assert.equal(capturedInit?.body, JSON.stringify({ hi: 'world' }))
        assert.ok(result.structured)
        assert.equal(result.structured.status, 201)
        assert.equal(result.structured.ok, true)
        assert.equal(result.structured.headers['content-type'], 'application/json')
        assert.deepEqual(result.structured.body, { ok: true, echoed: true })
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('http_request uses tauri relay proxy by default when proxy port exists', async () => {
    const tool = getTool('http_request')
    let capturedUrl = ''

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request) => {
        capturedUrl = String(input)
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        })
    }) as typeof fetch

    try {
        const result = await tool.execute(tool.schema.parse({
            url: 'https://example.com/api/items?from=test'
        }) as Record<string, any>, {
            ...baseContext,
            nodeContext: {
                ...baseContext.nodeContext,
                globalState: new Map([
                    ['__tauriProxyPort', 6190]
                ])
            }
        })

        assert.equal(result.success, true)
        assert.equal(capturedUrl, 'http://127.0.0.1:6190/relay/https/example.com/api/items?from=test')
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('http_request preserves custom content-type and string body', async () => {
    const tool = getTool('http_request')
    let capturedInit: RequestInit | undefined

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        capturedInit = init
        return new Response('plain text response', {
            status: 200,
            headers: { 'content-type': 'text/plain' }
        })
    }) as typeof fetch

    try {
        const result = await tool.execute(tool.schema.parse({
            url: 'https://example.com/plain',
            method: 'PATCH',
            headers: { 'Content-Type': 'text/plain' },
            body: 'raw-body'
        }) as Record<string, any>, baseContext)

        assert.equal(capturedInit?.method, 'PATCH')
        assert.equal((capturedInit?.headers as Record<string, string>)['Content-Type'], 'text/plain')
        assert.equal(capturedInit?.body, 'raw-body')
        assert.equal(result.structured.body, 'plain text response')
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('http_request times out when fetch does not resolve in time', async () => {
    const tool = getTool('http_request')
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch

    try {
        await assert.rejects(
            tool.execute(tool.schema.parse({ url: 'https://example.com' }) as Record<string, any>, {
                ...baseContext,
                timeout: 20
            }),
            /http_request 超时\(20ms\)/
        )
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('get_system_info returns expected shape', async () => {
    const tool = getTool('get_system_info')
    try {
        const result = await tool.execute(tool.schema.parse({}) as Record<string, any>, baseContext)
        assert.equal(result.success, true)
        assert.equal(typeof result.structured.platform, 'string')
        assert.equal(typeof result.structured.arch, 'string')
        assert.equal(typeof result.structured.release, 'string')
        assert.equal(typeof result.structured.cpu_count, 'number')
        assert.equal(typeof result.structured.hostname, 'string')
        assert.equal(typeof result.structured.total_memory, 'number')
        assert.equal(typeof result.structured.free_memory, 'number')
    } catch (error: any) {
        assert.match(String(error?.message || error), /EPERM|operation not permitted/i)
    }
})

test('get_time returns requested timezone and valid timestamps', async () => {
    const tool = getTool('get_time')
    const result = await tool.execute(tool.schema.parse({ timeZone: 'Asia/Shanghai' }) as Record<string, any>, baseContext)

    assert.equal(result.success, true)
    assert.equal(result.structured.timeZone, 'Asia/Shanghai')
    assert.equal(typeof result.structured.unixMs, 'number')
    assert.doesNotThrow(() => new Date(result.structured.iso))
    assert.equal(typeof result.structured.locale, 'string')
    assert.ok(result.content.includes('"timeZone": "Asia/Shanghai"'))
})

test('open_url_in_browser returns success without side effects outside tauri', async () => {
    const tool = getTool('open_url_in_browser')
    const originalTauriInternals = (globalThis as any).__TAURI_INTERNALS__

    try {
        delete (globalThis as any).__TAURI_INTERNALS__
        const result = await tool.execute(tool.schema.parse({ url: 'https://example.com' }) as Record<string, any>, baseContext)

        assert.equal(result.success, true)
        assert.equal(result.structured.opened, false)
        assert.equal(result.structured.reason, 'not_tauri')
        assert.equal(result.structured.url, 'https://example.com')
    } finally {
        if (originalTauriInternals !== undefined) {
            ;(globalThis as any).__TAURI_INTERNALS__ = originalTauriInternals
        }
    }
})

test('open_url_in_browser invokes tauri backend when available', async () => {
    const tool = getTool('open_url_in_browser')
    const originalTauriInternals = (globalThis as any).__TAURI_INTERNALS__
    const originalInvoke = (globalThis as any).__agentTauriInvoke
    const invokeCalls: any[] = []

    try {
        ;(globalThis as any).__TAURI_INTERNALS__ = {}
        ;(globalThis as any).__agentTauriInvoke = async (cmd: string, args: Record<string, any>) => {
            invokeCalls.push({ cmd, args })
            return null
        }

        const result = await tool.execute(tool.schema.parse({ url: 'https://example.com' }) as Record<string, any>, baseContext)

        assert.equal(result.success, true)
        assert.equal(result.structured.opened, true)
        assert.equal(result.structured.url, 'https://example.com')
        assert.deepEqual(invokeCalls, [
            {
                cmd: 'sys_open_in_browser',
                args: { data: 'https://example.com' }
            }
        ])
    } finally {
        if (originalTauriInternals !== undefined) {
            ;(globalThis as any).__TAURI_INTERNALS__ = originalTauriInternals
        } else {
            delete (globalThis as any).__TAURI_INTERNALS__
        }

        if (originalInvoke !== undefined) {
            ;(globalThis as any).__agentTauriInvoke = originalInvoke
        } else {
            delete (globalThis as any).__agentTauriInvoke
        }
    }
})

test('list_available_nodes returns node metadata list', async () => {
    const tool = getTool('list_available_nodes')
    const result = await tool.execute(tool.schema.parse({}) as Record<string, any>, baseContext)

    assert.equal(result.success, true)
    assert.ok(Array.isArray(result.structured.nodes))
    assert.ok(result.structured.nodes.length > 0)
    const llmNode = result.structured.nodes.find((item: any) => item.nodeType === 'llm')
    assert.ok(llmNode)
    assert.equal(llmNode.name, 'LLM 调用')
    assert.ok(Array.isArray(llmNode.params))
})

test('execute_node runs target node by nodeType once', async () => {
    const tool = getTool('execute_node')
    const result = await tool.execute(tool.schema.parse({
        nodeType: 'ifelse',
        input: { score: 80 },
        params: {
            condition: {
                parameter: 'input.score',
                mode: 'greater_or_equal',
                value: 60
            }
        }
    }) as Record<string, any>, baseContext)

    assert.equal(result.success, true)
    assert.equal(result.structured.success, true)
    assert.equal(result.structured.nodeType, 'ifelse')
    assert.equal(result.structured.nodeName, '条件分支')
    assert.equal(result.structured.output._branch, true)
})
