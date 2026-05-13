import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'

const port = Number(process.env.PORT || 8787)
const upstreamBase = process.env.UPSTREAM_BASE_URL || 'https://api.openai.com'
const upstreamPath = process.env.UPSTREAM_PATH || '/v1/responses'
const logDir = process.env.LOG_DIR || ''
const redactHeaders = new Set(['authorization', 'cookie', 'set-cookie'])

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => resolve(Buffer.concat(chunks)))
        req.on('error', reject)
    })
}

function tryParseJson(text) {
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

function sanitizeHeaders(headers) {
    return Object.fromEntries(
        Object.entries(headers).map(([key, value]) => {
            if (redactHeaders.has(key.toLowerCase())) {
                return [key, '<redacted>']
            }
            return [key, value]
        })
    )
}

function buildUpstreamUrl(req) {
    const incomingUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
    const target = new URL(upstreamPath, upstreamBase)
    target.search = incomingUrl.search
    return target
}

function logSection(title, payload) {
    console.log(`\n=== ${title} ===`)
    if (typeof payload === 'string') {
        console.log(payload)
        return
    }
    console.log(JSON.stringify(payload, null, 2))
}

function ensureLogDir() {
    if (!logDir) return null
    fs.mkdirSync(logDir, { recursive: true })
    return logDir
}

function writeLogFile(requestId, suffix, payload) {
    const dir = ensureLogDir()
    if (!dir) return
    const filename = path.join(dir, `${requestId}.${suffix}.json`)
    fs.writeFileSync(filename, JSON.stringify(payload, null, 2))
}

const server = http.createServer(async (req, res) => {
    const startedAt = Date.now()
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    if (req.method === 'GET' && req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
    }

    const bodyBuffer = await readRequestBody(req)
    const bodyText = bodyBuffer.toString('utf8')
    const parsedJson = bodyText ? tryParseJson(bodyText) : null
    const upstreamUrl = buildUpstreamUrl(req)
    const requestPayload = {
        method: req.method,
        path: req.url,
        upstream: upstreamUrl.toString(),
        headers: sanitizeHeaders(req.headers),
        body: parsedJson ?? bodyText
    }

    logSection(`REQUEST ${requestId}`, requestPayload)
    writeLogFile(requestId, 'request', requestPayload)

    const forwardedHeaders = { ...req.headers }
    delete forwardedHeaders.host
    delete forwardedHeaders['content-length']

    const upstreamReq = https.request(upstreamUrl, {
        method: req.method,
        headers: forwardedHeaders
    }, upstreamRes => {
        const responseChunks = []
        upstreamRes.on('data', chunk => {
            responseChunks.push(chunk)
            res.write(chunk)
        })
        upstreamRes.on('end', () => {
            const responseBuffer = Buffer.concat(responseChunks)
            const responseText = responseBuffer.toString('utf8')
            const parsedResponse = responseText ? tryParseJson(responseText) : null
            const responsePayload = {
                status: upstreamRes.statusCode,
                headers: sanitizeHeaders(upstreamRes.headers),
                durationMs: Date.now() - startedAt,
                body: parsedResponse ?? responseText
            }

            logSection(`RESPONSE ${requestId}`, responsePayload)
            writeLogFile(requestId, 'response', responsePayload)

            res.end()
        })

        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
    })

    upstreamReq.on('error', error => {
        const errorPayload = {
            message: error.message,
            durationMs: Date.now() - startedAt
        }
        logSection(`ERROR ${requestId}`, errorPayload)
        writeLogFile(requestId, 'error', errorPayload)
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
            error: {
                message: error.message,
                type: 'proxy_error'
            }
        }))
    })

    if (bodyBuffer.length > 0) {
        upstreamReq.write(bodyBuffer)
    }
    upstreamReq.end()
})

server.listen(port, '127.0.0.1', () => {
    console.log(`codex responses proxy listening on http://127.0.0.1:${port}`)
    console.log(`forwarding to ${new URL(upstreamPath, upstreamBase).toString()}`)
    if (logDir) console.log(`writing logs to ${ensureLogDir()}`)
    console.log('health check: GET /healthz')
})
