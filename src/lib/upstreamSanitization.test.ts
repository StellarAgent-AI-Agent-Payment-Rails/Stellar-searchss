/**
 * Verifies that the shared handlers never leak upstream Groq/Serper SDK
 * details to public clients: generic message, correlation requestId, no model
 * identifiers, and `details` only in development.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('groq-sdk', () => ({
  default: class Groq {
    chat = { completions: { create } }
  },
}))

import { handleChat, handleSearch } from '../../server/handlers'

const GROQ_LEAK =
  'Error code: 429 - {"error":{"message":"Rate limit reached for model llama-3.3-70b-versatile","request":"req_9f2"}}'
const SERPER_LEAK = 'upstream payload: https://serper.dev model internal fragments'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.restoreAllMocks()
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' }
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('handleChat', () => {
  it('returns a generic 500 with requestId and no Groq SDK detail in production', async () => {
    create.mockRejectedValue(new Error(GROQ_LEAK))
    const result = await handleChat({
      messages: [{ role: 'user', content: 'hi' }],
      requestIdHeader: null,
    })
    expect(result.status).toBe(500)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe(
      'The AI assistant is temporarily unavailable. Please try again shortly.',
    )
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.details).toBeUndefined()
    expect(result.headers['X-Request-Id']).toBe(body.requestId)
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('Groq')
    expect(serialized).not.toContain('llama')
    expect(serialized).not.toContain('req_9f2')
    expect(serialized).not.toContain('Rate limit')
  })

  it('echoes a safe inbound request id', async () => {
    create.mockRejectedValue(new Error(GROQ_LEAK))
    const result = await handleChat({
      messages: [{ role: 'user', content: 'hi' }],
      requestIdHeader: 'edge-req-7',
    })
    expect((result.body as Record<string, unknown>).requestId).toBe('edge-req-7')
  })

  it('includes details only in development', async () => {
    process.env.NODE_ENV = 'development'
    create.mockRejectedValue(new Error(GROQ_LEAK))
    const result = await handleChat({
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect((result.body as Record<string, unknown>).details).toContain('Rate limit')
  })
})

describe('handleSearch', () => {
  it('returns a generic 502 with requestId and no Serper detail in production', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(SERPER_LEAK, { status: 429 })),
    )
    const result = await handleSearch({
      query: 'stellar',
      paymentSignature: 'dummy_sig',
      requestIdHeader: 'search-req-1',
    })
    expect(result.status).toBe(502)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe(
      'Search is temporarily unavailable. Please try again later.',
    )
    expect(body.requestId).toBe('search-req-1')
    expect(body.details).toBeUndefined()
    expect(result.headers['X-Request-Id']).toBe('search-req-1')
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('Serper')
    expect(serialized).not.toContain('serper.dev')
    expect(serialized).not.toContain('upstream payload')
  })

  it('returns a generic 500 with requestId when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unreachable https://google.serper.dev/search')
      }),
    )
    const result = await handleSearch({
      query: 'stellar',
      paymentSignature: 'dummy_sig',
    })
    expect(result.status).toBe(500)
    const body = result.body as Record<string, unknown>
    expect(body.requestId).toEqual(expect.any(String))
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('google.serper.dev')
    expect(serialized).not.toContain('network unreachable')
  })
})
