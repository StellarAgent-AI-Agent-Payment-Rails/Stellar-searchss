/**
 * Integration tests for the server error paths.
 *
 * Upstream calls are stubbed so the tests assert on exactly what a client would
 * receive, without any network access or real API keys.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import logger from './logger'

const ORIGINAL_ENV = process.env.NODE_ENV

// Mock the Groq SDK before the server module is imported. `create` throws a
// realistic SDK error whose message leaks the model identifier.
const groqCreate = vi.fn()

// The paid routes are wrapped in the x402 payment middleware, which would
// reject every test request with 402 before the handler runs. These tests are
// about error sanitization inside the handlers, so the payment gate is stubbed
// out with a pass-through. Payment behavior is covered by its own suite.
vi.mock('@x402/express', () => ({
  paymentMiddlewareFromConfig: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('groq-sdk', () => {
  class FakeAPIError extends Error {
    status: number
    code: string
    constructor(message: string, status: number) {
      super(message)
      this.name = 'APIError'
      this.status = status
      this.code = 'rate_limit_exceeded'
    }
  }
  return {
    default: class Groq {
      chat = {
        completions: {
          create: (...args: unknown[]) => groqCreate(...args),
        },
      }
    },
    APIError: FakeAPIError,
  }
})

async function loadApp(): Promise<Express> {
  const mod = await import('./index')
  return mod.default as unknown as Express
}

const GROQ_LEAK = 'Error code: 429 - {"error":{"message":"Rate limit reached for model llama-3.3-70b-versatile","request":"req_9f2"}}'

function groqError() {
  const err: any = new Error(GROQ_LEAK)
  err.name = 'APIError'
  err.status = 429
  err.code = 'rate_limit_exceeded'
  return err
}

let app: Express

/**
 * Spy on the winston logger's `error` method. Winston's own type signature
 * takes a single argument, so the mock is cast to match and the metadata is
 * read back through a dedicated helper.
 */
function spyOnLoggerError() {
  return vi
    .spyOn(logger, 'error')
    .mockImplementation((() => logger) as unknown as typeof logger.error)
}

/** Read the metadata object passed as the second log argument. */
function firstLogMeta(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const call = spy.mock.calls[0] as unknown[]
  return (call[1] ?? {}) as Record<string, unknown>
}

beforeEach(async () => {
  process.env.NODE_ENV = 'production'
  groqCreate.mockReset()
  app = await loadApp()
})

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Assert nothing upstream-specific survived into the response. */
function expectNoUpstreamLeak(serialized: string) {
  expect(serialized).not.toContain('llama-3.3-70b-versatile')
  expect(serialized).not.toContain('groq')
  expect(serialized).not.toContain('serper')
  expect(serialized).not.toContain('APIError')
  expect(serialized).not.toContain('rate_limit_exceeded')
  expect(serialized).not.toContain('Groq AI error')
  expect(serialized).not.toContain('Serper.dev API error')
  expect(serialized).not.toContain('req_9f2')
}

describe('POST /ai/chat (non-streaming)', () => {
  it('returns a generic message and requestId when Groq fails', async () => {
    groqCreate.mockRejectedValue(groqError())

    const res = await request(app)
      .post('/ai/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe(
      'The AI assistant is temporarily unavailable. Please try again shortly.',
    )
    expect(res.body.code).toBe('ai_unavailable')
    expect(res.body.requestId).toEqual(expect.any(String))
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expectNoUpstreamLeak(JSON.stringify(res.body))
    expect(res.body.details).toBeUndefined()
  })

  it('echoes the correlation ID in a response header', async () => {
    groqCreate.mockRejectedValue(groqError())

    const res = await request(app)
      .post('/ai/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    expect(res.headers['x-request-id']).toBe(res.body.requestId)
  })

  it('honours a safe inbound correlation ID', async () => {
    groqCreate.mockRejectedValue(groqError())

    const res = await request(app)
      .post('/ai/chat')
      .set('X-Request-Id', 'client-req-42')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    expect(res.body.requestId).toBe('client-req-42')
    expectNoUpstreamLeak(JSON.stringify(res.body))
  })

  it('replaces an unsafe inbound correlation ID', async () => {
    groqCreate.mockRejectedValue(groqError())

    const res = await request(app)
      .post('/ai/chat')
      .set('X-Request-Id', 'injected id with spaces')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    expect(res.body.requestId).not.toBe('injected id with spaces')
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns the same requestId in the body and the server log', async () => {
    groqCreate.mockRejectedValue(groqError())
    const spy = spyOnLoggerError()

    const res = await request(app)
      .post('/ai/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    expect(spy).toHaveBeenCalledTimes(1)
    const loggedMeta = firstLogMeta(spy)
    expect(loggedMeta.requestId).toBe(res.body.requestId)
    expect(String(loggedMeta.detail)).toContain('llama-3.3-70b-versatile')
  })

  it('still returns the completion on the success path', async () => {
    groqCreate.mockResolvedValue({
      model: 'llama-3.3-70b-versatile',
      choices: [{ message: { content: 'hello there' } }],
    })

    const res = await request(app)
      .post('/ai/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    expect(res.status).toBe(200)
    expect(res.body.content).toBe('hello there')
    expect(res.body.model).toBe('llama-3.3-70b-versatile')
  })
})

describe('POST /ai/chat (SSE stream)', () => {
  it('emits a sanitized error event without upstream details', async () => {
    groqCreate.mockRejectedValue(groqError())

    const res = await request(app)
      .post('/ai/chat?stream=1')
      .set('Accept', 'text/event-stream')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    const body = res.text
    expect(body).toContain('event: error')
    expect(body).toContain('The AI assistant is temporarily unavailable')
    expectNoUpstreamLeak(body)
  })

  it('includes requestId in the stream error event', async () => {
    groqCreate.mockRejectedValue(groqError())

    const res = await request(app)
      .post('/ai/chat?stream=1')
      .set('Accept', 'text/event-stream')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    const match = res.text.match(/"requestId":"([^"]+)"/)
    expect(match).not.toBeNull()
    expect(res.headers['x-request-id']).toBe(match![1])
  })

  it('streams deltas on the success path', async () => {
    groqCreate.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'Hel' } }] }
        yield { choices: [{ delta: { content: 'lo' } }] }
      })(),
    )

    const res = await request(app)
      .post('/ai/chat?stream=1')
      .set('Accept', 'text/event-stream')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    expect(res.text).toContain('event: delta')
    expect(res.text).toContain('Hel')
    expect(res.text).toContain('event: done')
    expect(res.text).not.toContain('event: error')
  })

  it('still streams when the client disconnects mid-response', async () => {
    // Regression guard: the abort signal must not fire just because
    // express.json() consumed the request body.
    let seenSignal: AbortSignal | undefined
    groqCreate.mockImplementation((_params: unknown, opts: any) => {
      seenSignal = opts?.signal
      return Promise.resolve(
        (async function* () {
          yield { choices: [{ delta: { content: 'ok' } }] }
        })(),
      )
    })

    const res = await request(app)
      .post('/ai/chat?stream=1')
      .set('Accept', 'text/event-stream')
      .send({ messages: [{ role: 'user', content: 'hi' }] })

    expect(seenSignal).toBeDefined()
    expect(seenSignal!.aborted).toBe(false)
    expect(res.text).toContain('event: done')
  })
})

describe('Serper upstream failures', () => {
  function stubSerper(status: number, body: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status,
        text: async () => body,
        json: async () => ({}),
      })),
    )
  }

  const routes = [
    ['/search', 'serper.search'],
    ['/images', 'serper.images'],
    ['/news', 'serper.news'],
  ] as const

  it.each(routes)('returns a generic 502 from %s', async (route) => {
    stubSerper(429, '{"message":"Not enough credits. Upgrade at serper.dev"}')

    const res = await request(app).get(`${route}?q=stellar`)

    expect(res.status).toBe(502)
    expect(res.body.code).toBe('upstream_unavailable')
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.error).toMatch(/temporarily unavailable/i)
    expect(res.body.error).not.toContain('Serper')
    expect(res.body.details).toBeUndefined()
    expectNoUpstreamLeak(JSON.stringify(res.body))
  })

  it('does not leak the upstream status code to the client', async () => {
    stubSerper(403, 'forbidden')

    const res = await request(app).get('/search?q=stellar')

    expect(res.status).toBe(502)
    expect(res.body.error).not.toContain('403')
    expect(res.body.error).not.toContain('forbidden')
  })

  it('logs the Serper status and body server-side with the requestId', async () => {
    stubSerper(500, 'upstream exploded')
    const spy = spyOnLoggerError()

    const res = await request(app).get('/search?q=stellar')

    const loggedMeta = firstLogMeta(spy)
    expect(loggedMeta.requestId).toBe(res.body.requestId)
    expect(loggedMeta.status).toBe(500)
    expect(String(loggedMeta.responseBody)).toContain('upstream exploded')
  })
})

describe('validation errors are unaffected', () => {
  it('still returns 400 for a missing query', async () => {
    const res = await request(app).get('/search')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Missing required parameter: q')
  })

  it('still returns 400 for a missing messages array', async () => {
    const res = await request(app).post('/ai/chat').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('messages array required')
  })
})

describe('health endpoint', () => {
  it('does not expose secrets', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.groqApiConfigured).toBe(true)
    expect(JSON.stringify(res.body)).not.toContain('test-groq-key')
  })
})
