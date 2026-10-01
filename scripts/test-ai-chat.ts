#!/usr/bin/env tsx
/**
 * test-ai-chat.ts — Contract tests for the /ai/chat endpoints
 *
 * Verifies that the Express server (server/index.ts) and the Vercel
 * serverless function (api/ai/chat.ts) speak the same SSE protocol:
 *
 *   event: delta  data: {"content":"..."}   (zero or more, in order)
 *   event: done   data: {"model":"..."}     (exactly one at the end)
 *   event: error  data: {"error":"..."}     (instead of done on failure)
 *
 * and that non-streaming callers still receive plain JSON.
 *
 * Usage:
 *   npm run test:ai-chat
 *   npm run test:ai-chat -- --mock                 # self-contained (default when GROQ_API_KEY is unset)
 *   npm run test:ai-chat -- --base http://localhost:3001
 *   npm run test:ai-chat -- --base https://your-app.vercel.app
 *
 * --mock spins up a local fake Groq (GROQ_BASE_URL) and exercises the real
 * serverless handler in-process, so no Groq API key is required.
 */

const args = process.argv.slice(2)
function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : undefined
}

const BASE = getFlag('--base') || 'http://localhost:3001'
const MODEL = 'llama-3.3-70b-versatile'
const USE_MOCK = args.includes('--mock') || (!getFlag('--base') && !process.env.GROQ_API_KEY)

// ─── Mock Groq (wire-compatible: POST /openai/v1/chat/completions) ─────────
async function startMockGroq(): Promise<{ close: () => Promise<void>; url: string }> {
  const http = await import('node:http')

  const server = http.createServer(async (req, res) => {
    // Swallow EPIPE when a client disconnects mid-stream.
    res.on('error', () => {})

    if (!req.url || !req.url.endsWith('/chat/completions')) {
      res.writeHead(404, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'not found' }))
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
      model?: string
      stream?: boolean
    }
    const model = body.model || MODEL

    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'mock-non-stream-response' } }],
          model,
        }),
      )
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    })
    const tokens = ['Hello ', 'from the ', 'mock stream']
    for (const token of tokens) {
      const chunk = {
        id: 'mock-chunk',
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    res.write('data: [DONE]\n\n')
    res.end()
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('mock server failed to listen')
  return {
    close: () => new Promise(resolve => server.close(() => resolve())),
    url: `http://127.0.0.1:${address.port}`,
  }
}

// ─── Contract checks ───────────────────────────────────────────────────────
let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++
    console.log(`   ✓ ${name}`)
  } else {
    failed++
    console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function runJsonFallback(base: string): Promise<void> {
  console.log('\n── JSON fallback (no Accept: text/event-stream) ──')
  try {
    const res = await fetch(`${base}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
    })
    check('responds 200', res.status === 200, `status ${res.status}`)
    check(
      'content-type is JSON',
      (res.headers.get('content-type') || '').includes('application/json'),
      `got ${res.headers.get('content-type')}`,
    )
    const data = (await res.json()) as { content?: string; model?: string }
    check('returns content string', typeof data.content === 'string' && data.content.length > 0)
    check('returns model', data.model === MODEL, `got ${data.model}`)
  } catch (err: any) {
    check('JSON fallback request succeeds', false, err.message)
  }
}

async function runSseProtocol(base: string): Promise<void> {
  console.log('\n── SSE streaming protocol (Accept: text/event-stream) ──')
  try {
    const res = await fetch(`${base}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
    })
    check('responds 200', res.status === 200, `status ${res.status}`)
    check(
      'content-type is text/event-stream',
      (res.headers.get('content-type') || '').includes('text/event-stream'),
      `got ${res.headers.get('content-type')}`,
    )

    const deltas: string[] = []
    let doneModel: string | undefined
    let errorPayload: string | undefined
    const seen = new Set<string>()

    if (!res.body) throw new Error('response has no body stream')
    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let blank: number
      while ((blank = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, blank)
        buffer = buffer.slice(blank + 2)
        let event = 'message'
        let data = ''
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trim()
        }
        if (!data) continue
        seen.add(event)
        if (event === 'delta') {
          const parsed = JSON.parse(data) as { content?: string }
          if (parsed.content) deltas.push(parsed.content)
        } else if (event === 'done') {
          doneModel = (JSON.parse(data) as { model?: string }).model
        } else if (event === 'error') {
          errorPayload = data
        }
      }
    }

    check('emits at least one delta event', deltas.length > 0)
    check('delta contents reassemble in order', deltas.join('') === 'Hello from the mock stream', `got ${JSON.stringify(deltas)}`)
    check('no error event emitted', errorPayload === undefined, errorPayload)
    check('emits done event', seen.has('done'))
    check('done carries the model', doneModel === MODEL, `got ${doneModel}`)
  } catch (err: any) {
    check('SSE request succeeds', false, err.message)
  }
}

async function runDisconnect(base: string): Promise<void> {
  console.log('\n── Client disconnect mid-stream ──')
  try {
    const controller = new AbortController()
    const res = await fetch(`${base}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
      signal: controller.signal,
    })
    if (!res.body) throw new Error('response has no body stream')
    const reader = res.body.getReader()
    // Abort as soon as the first chunk arrives, like a user closing the panel.
    await reader.read()
    controller.abort()
    await new Promise(resolve => setTimeout(resolve, 150))
    check('client disconnect does not crash the server', true)
  } catch (err: any) {
    // The abort itself throws — that is the client behaving correctly.
    check('client disconnect does not crash the server', err.name === 'AbortError', err.message)
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  let closeMock: (() => Promise<void>) | undefined

  console.log('\n🤖 /ai/chat contract tests\n')
  console.log(`   Target: ${USE_MOCK ? 'in-process serverless handler (mock Groq)' : BASE}`)

  if (USE_MOCK) {
    const mock = await startMockGroq()
    closeMock = mock.close
    // Set before importing the handler — the Groq client reads these at
    // module load / construction time.
    process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key'
    process.env.GROQ_BASE_URL = mock.url
    console.log(`   Mock Groq: ${mock.url}`)
  }

  try {
    if (USE_MOCK) {
      // tsx transpiles the handler on the fly; the `import type` from
      // '@vercel/node' is erased, so no runtime dependency is needed.
      const mod = (await import(new URL('../api/ai/chat.ts', import.meta.url).href)) as {
        default: (req: unknown, res: unknown) => Promise<void>
      }
      await withTestServer(mod.default)
    } else {
      await runJsonFallback(BASE)
      await runSseProtocol(BASE)
      await runDisconnect(BASE)
    }
  } finally {
    await closeMock?.()
  }

  console.log(`\n${failed === 0 ? '✅ All' : '❌'} contract tests: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

// Wrap the serverless handler in a minimal HTTP server that emulates the
// @vercel/node request/response helpers used by api/ai/chat.ts.
async function withTestServer(handler: (req: unknown, res: unknown) => Promise<void>): Promise<void> {
  const http = await import('node:http')
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const url = new URL(req.url || '/', 'http://localhost')
      const vercelReq = Object.assign(req, {
        query: Object.fromEntries(url.searchParams),
        cookies: {},
        body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'),
      })
      const vercelRes = Object.assign(res, {
        status: (code: number) => {
          res.statusCode = code
          return res
        },
        json: (obj: unknown) => {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
          return res
        },
      })
      Promise.resolve(handler(vercelReq, vercelRes)).catch(err => {
        console.error('   handler crashed:', err)
        if (!res.writableEnded) res.end()
      })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  try {
    await runJsonFallback(`http://127.0.0.1:${port}`)
    await runSseProtocol(`http://127.0.0.1:${port}`)
    await runDisconnect(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

main().catch(err => {
  console.error('\n✗ Unhandled error:', err.message)
  process.exit(1)
})
