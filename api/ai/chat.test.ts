/**
 * Tests for the Vercel serverless handlers, which are a separate code path from
 * server/index.ts and had the same upstream-message leak.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const groqCreate = vi.fn()
vi.mock('groq-sdk', () => ({
  default: class Groq {
    chat = { completions: { create: (...args: unknown[]) => groqCreate(...args) } }
  },
}))

import chatHandler from './chat'

const ORIGINAL_ENV = process.env.NODE_ENV

const GROQ_LEAK =
  'Error code: 429 - {"error":{"message":"Rate limit reached for model llama-3.3-70b-versatile","request":"req_9f2"}}'

function groqError() {
  const err: any = new Error(GROQ_LEAK)
  err.name = 'APIError'
  err.status = 429
  return err
}

/** Minimal Vercel-style request/response pair. */
function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      // Vercel's res.json() implies a 200 when no explicit status was set.
      if (res.statusCode === 0) res.statusCode = 200
      res.body = payload
      return res
    },
    setHeader(key: string, value: string) {
      res.headers[key.toLowerCase()] = value
    },
  }
  return res
}

beforeEach(() => {
  process.env.NODE_ENV = 'production'
  groqCreate.mockReset()
})

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV
  vi.restoreAllMocks()
})

describe('api/ai/chat', () => {
  it('does not leak the Groq SDK message in production', async () => {
    groqCreate.mockRejectedValue(groqError())

    const req: any = { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, headers: {} }
    const res = makeRes()

    await chatHandler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body.error).toBe(
      'The AI assistant is temporarily unavailable. Please try again shortly.',
    )
    expect(res.body.code).toBe('ai_unavailable')
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.details).toBeUndefined()

    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain('llama-3.3-70b-versatile')
    expect(serialized).not.toContain('Groq AI error')
    expect(serialized).not.toContain('429')
    expect(serialized).not.toContain('req_9f2')
  })

  it('sets the X-Request-Id header matching the body', async () => {
    groqCreate.mockRejectedValue(groqError())

    const req: any = { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, headers: {} }
    const res = makeRes()

    await chatHandler(req, res)

    expect(res.headers['x-request-id']).toBe(res.body.requestId)
  })

  it('honours a safe inbound request id', async () => {
    groqCreate.mockRejectedValue(groqError())

    const req: any = {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }] },
      headers: { 'x-request-id': 'edge-req-7' },
    }
    const res = makeRes()

    await chatHandler(req, res)

    expect(res.body.requestId).toBe('edge-req-7')
  })

  it('includes redacted details only in development', async () => {
    process.env.NODE_ENV = 'development'
    groqCreate.mockRejectedValue(groqError())

    const req: any = { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, headers: {} }
    const res = makeRes()

    await chatHandler(req, res)

    expect(res.body.details).toBeDefined()
    expect(res.body.details).toContain('llama-3.3-70b-versatile')
  })

  it('keeps the success path unchanged', async () => {
    groqCreate.mockResolvedValue({
      model: 'llama-3.3-70b-versatile',
      choices: [{ message: { content: 'hello' } }],
    })

    const req: any = { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, headers: {} }
    const res = makeRes()

    await chatHandler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ content: 'hello', model: 'llama-3.3-70b-versatile' })
  })

  it('rejects non-POST methods and empty message arrays', async () => {
    const res1 = makeRes()
    await chatHandler({ method: 'GET', body: {}, headers: {} } as any, res1)
    expect(res1.statusCode).toBe(405)

    const res2 = makeRes()
    await chatHandler({ method: 'POST', body: {}, headers: {} } as any, res2)
    expect(res2.statusCode).toBe(400)
  })
})
