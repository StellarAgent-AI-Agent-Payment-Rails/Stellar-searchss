/**
 * Parity tests: the Express app (server/app.ts) and the Vercel serverless
 * functions (api/*) must produce identical `{ status, body }` for the same
 * input. Both entry points now call the same framework-free handlers in
 * server/handlers.ts; these tests prove the adapters don't diverge.
 *
 * The Serper and Groq network calls are mocked by the MSW server configured in
 * tests/setup.ts. Payment is disabled for the happy-path search case (the same
 * dev-only switch both targets use), so the shared search logic can be
 * exercised end to end.
 */

import { describe, test, beforeAll, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import http, { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

// Must be set before the app/handlers modules are imported (they read env at
// call time, but createApp() inspects the payment flag when it runs).
process.env.NODE_ENV = 'development'
process.env.VERCEL_ENV = 'development'
process.env.PAYMENTS_DISABLED = 'true'
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key'
process.env.SERPER_API_KEY = process.env.SERPER_API_KEY || 'test-serper-key'
process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'stellar:testnet'
process.env.STELLAR_RECEIVING_ADDRESS =
  process.env.STELLAR_RECEIVING_ADDRESS ||
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

const { createApp } = await import('../server/app')
const { handleSearch } = await import('../server/handlers')
const healthHandler = (await import('../api/health')).default
const searchHandler = (await import('../api/search')).default
const chatHandler = (await import('../api/ai/chat')).default

type ServerlessHandler = (req: any, res: any) => unknown

interface Snapshot {
  status: number
  body: unknown
  headers: Record<string, string>
}

// Fields that are inherently per-process / per-call and therefore cannot be
// compared across two independent invocations.
const VOLATILE: Record<string, string[]> = {
  health: ['uptime'],
  search: ['latencyMs', 'txHash'],
  chat: [],
}

function normalizeRaw(raw: string, contentType?: string): unknown {
  if (raw === '') return null
  if (contentType && !contentType.includes('application/json')) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function makeRes(): any {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    status(code: number) {
      this.statusCode = code
      return this
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value
      return this
    },
    json(data: unknown) {
      this.headers['content-type'] = 'application/json'
      this.body = JSON.stringify(data)
      return this
    },
    send(data: unknown) {
      this.body = typeof data === 'string' ? data : JSON.stringify(data)
      return this
    },
    end(data?: unknown) {
      if (data !== undefined) {
        this.body = typeof data === 'string' ? data : JSON.stringify(data)
      }
      return this
    },
    write() {
      return true
    },
    flushHeaders() {},
    on() {
      return this
    },
    writableEnded: false,
  }
}

async function callServerless(
  handler: ServerlessHandler,
  method: 'GET' | 'POST',
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Snapshot> {
  const url = new URL(path, 'http://localhost')
  const req: any = {
    method,
    url: url.pathname + url.search,
    headers: { ...(opts.headers ?? {}) },
    body: opts.body,
    query: Object.fromEntries(url.searchParams.entries()),
  }
  const res = makeRes()
  await handler(req, res)
  return {
    status: res.statusCode,
    body: normalizeRaw(res.body, res.headers['content-type']),
    headers: res.headers,
  }
}

async function callExpress(
  baseUrl: string,
  method: 'GET' | 'POST',
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Snapshot> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  let body: string | undefined
  if (opts.body !== undefined) {
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }
  const res = await fetch(new URL(path, baseUrl), { method, headers, body })
  const raw = await res.text()
  const out: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return {
    status: res.status,
    body: normalizeRaw(raw, res.headers.get('content-type') ?? undefined),
    headers: out,
  }
}

function stripVolatile(body: unknown, kind: string): unknown {
  if (!body || typeof body !== 'object') return body
  const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>
  for (const key of VOLATILE[kind] ?? []) delete clone[key]
  return clone
}

interface ParityCase {
  name: string
  kind: keyof typeof VOLATILE
  method: 'GET' | 'POST'
  expressPath: string
  serverlessPath: string
  handler: ServerlessHandler
  body?: unknown
  headers?: Record<string, string>
}

const cases: ParityCase[] = [
  {
    name: 'health',
    kind: 'health',
    method: 'GET',
    expressPath: '/health',
    serverlessPath: '/api/health',
    handler: healthHandler,
  },
  {
    name: 'search happy path',
    kind: 'search',
    method: 'GET',
    expressPath: '/search?q=Stellar+blockchain',
    serverlessPath: '/api/search?q=Stellar+blockchain',
    handler: searchHandler,
  },
  {
    name: 'search missing query',
    kind: 'search',
    method: 'GET',
    expressPath: '/search',
    serverlessPath: '/api/search',
    handler: searchHandler,
  },
  {
    name: 'search empty query',
    kind: 'search',
    method: 'GET',
    expressPath: '/search?q=',
    serverlessPath: '/api/search?q=',
    handler: searchHandler,
  },
  {
    name: 'search over-long query',
    kind: 'search',
    method: 'GET',
    expressPath: `/search?q=${'a'.repeat(257)}`,
    serverlessPath: `/api/search?q=${'a'.repeat(257)}`,
    handler: searchHandler,
  },
  {
    name: 'chat JSON completion',
    kind: 'chat',
    method: 'POST',
    expressPath: '/ai/chat',
    serverlessPath: '/api/ai/chat',
    handler: chatHandler,
    body: { messages: [{ role: 'user', content: 'hello' }] },
  },
  {
    name: 'chat missing messages',
    kind: 'chat',
    method: 'POST',
    expressPath: '/ai/chat',
    serverlessPath: '/api/ai/chat',
    handler: chatHandler,
    body: {},
  },
]

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind test server'))
        return
      }
      resolve(addr)
    })
  })
}

describe('parity between Express and Vercel serverless handlers', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    server = http.createServer(createApp())
    const addr = await listen(server)
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    if (!server) return
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  })

  for (const testCase of cases) {
    test(`${testCase.name}: Express and serverless agree`, async () => {
      const [expressRes, serverlessRes] = await Promise.all([
        callExpress(baseUrl, testCase.method, testCase.expressPath, {
          body: testCase.body,
          headers: testCase.headers,
        }),
        callServerless(testCase.handler, testCase.method, testCase.serverlessPath, {
          body: testCase.body,
          headers: testCase.headers,
        }),
      ])

      assert.strictEqual(
        serverlessRes.status,
        expressRes.status,
        `status diverged for ${testCase.name}: Express=${expressRes.status} serverless=${serverlessRes.status}`,
      )
      assert.deepStrictEqual(
        stripVolatile(serverlessRes.body, testCase.kind),
        stripVolatile(expressRes.body, testCase.kind),
        `body diverged for ${testCase.name}`,
      )
    })
  }

  test('search happy path returns the canonical result shape', async () => {
    const res = await callExpress(baseUrl, 'GET', '/search?q=Stellar+blockchain')
    assert.strictEqual(res.status, 200)
    const body = res.body as Record<string, unknown>
    assert.equal(body.query, 'Stellar blockchain')
    assert.equal(body.count, 1)
    assert.equal(body.network, 'stellar:testnet')
    assert.equal(body.paidAmount, '0.001')
    assert.equal(body.currency, 'USDC')
    assert.ok(Array.isArray(body.results))
    assert.ok(Array.isArray(body.suggestions))
  })
})

describe('payment enforcement (shared handler)', () => {
  test('returns a 402 x402 challenge when payment is required and absent', async () => {
    const productionEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PAYMENTS_DISABLED: 'false',
    }
    const result = await handleSearch({ query: 'stellar', env: productionEnv })

    assert.strictEqual(result.status, 402)
    assert.deepStrictEqual(result.body, { error: 'Payment required' })
    assert.ok(result.headers['PAYMENT-REQUIRED'])
    const decoded = JSON.parse(
      Buffer.from(result.headers['PAYMENT-REQUIRED'], 'base64').toString('utf8'),
    )
    assert.equal(decoded.x402Version, 2)
    assert.equal(decoded.accepts[0].network, 'stellar:testnet')
    assert.match(decoded.accepts[0].asset, /^C/)
  })

  test('serves the search when a payment signature is present', async () => {
    const productionEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PAYMENTS_DISABLED: 'false',
    }
    const result = await handleSearch({
      query: 'stellar',
      paymentSignature: 'signed',
      env: productionEnv,
    })
    assert.strictEqual(result.status, 200)
  })
})
