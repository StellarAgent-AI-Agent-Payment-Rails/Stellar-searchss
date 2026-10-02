/**
 * Tests for the Vercel /api/search Serper error path.
 *
 * The x402 payment gate is satisfied with a dummy header — this suite is only
 * concerned with what the client sees when Serper fails.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const ORIGINAL_ENV = process.env.NODE_ENV

const PAYMENT_HEADER = Buffer.from(
  JSON.stringify({ transactionHash: 'stub_tx_hash' }),
).toString('base64')

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
      if (res.statusCode === 0) res.statusCode = 200
      res.body = payload
      return res
    },
    setHeader(key: string, value: string) {
      res.headers[key.toLowerCase()] = value
    },
    end() {
      if (res.statusCode === 0) res.statusCode = 200
      return res
    },
  }
  return res
}

function makeReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    query: { q: 'stellar' },
    headers: { 'payment-signature': PAYMENT_HEADER, host: 'example.test' },
    body: undefined,
    url: '/api/search?q=stellar',
    ...overrides,
  } as unknown as VercelRequest
}

async function loadHandler() {
  const mod = await import('./search')
  return mod.default
}

function stubFetch(status: number, body: string) {
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

beforeEach(() => {
  process.env.NODE_ENV = 'production'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('api/search Serper failures', () => {
  it('returns a generic 502 with a requestId and no upstream detail', async () => {
    stubFetch(403, '{"message":"Not enough credits. Upgrade at serper.dev"}')
    const handler = await loadHandler()
    const res = makeRes()

    await handler(makeReq(), res as VercelResponse)

    expect(res.statusCode).toBe(502)
    expect(res.body.code).toBe('upstream_unavailable')
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.details).toBeUndefined()

    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain('Serper')
    expect(serialized).not.toContain('serper')
    expect(serialized).not.toContain('403')
    expect(serialized).not.toContain('Not enough credits')
  })

  it('logs the upstream status and body server-side', async () => {
    stubFetch(500, 'upstream exploded')
    const handler = await loadHandler()
    const res = makeRes()

    await handler(makeReq(), res as VercelResponse)

    const spy = console.error as unknown as ReturnType<typeof vi.fn>
    const loggedMeta = spy.mock.calls[0][1] as Record<string, unknown>
    expect(loggedMeta.requestId).toBe(res.body.requestId)
    expect(loggedMeta.status).toBe(500)
    expect(String(loggedMeta.responseBody)).toContain('upstream exploded')
  })

  it('sets the X-Request-Id header matching the body', async () => {
    stubFetch(500, 'boom')
    const handler = await loadHandler()
    const res = makeRes()

    await handler(makeReq(), res as VercelResponse)

    expect(res.headers['x-request-id']).toBe(res.body.requestId)
    expect(res.headers['access-control-expose-headers']).toContain('X-Request-Id')
  })

  it('returns a sanitized 500 when the fetch itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND google.serper.dev key=gsk_abcdefgh12345678')
      }),
    )
    const handler = await loadHandler()
    const res = makeRes()

    await handler(makeReq(), res as VercelResponse)

    expect(res.statusCode).toBe(500)
    expect(res.body.code).toBe('search_failed')
    expect(res.body.details).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain('ENOTFOUND')
    expect(JSON.stringify(res.body)).not.toContain('serper')
    expect(JSON.stringify(res.body)).not.toContain('gsk_abcdefgh12345678')
  })

  it('still requires payment before touching Serper', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()
    const res = makeRes()

    await handler(makeReq({ headers: { host: 'example.test' } }), res as VercelResponse)

    expect(res.statusCode).toBe(402)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still returns results on the success path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          organic: [{ title: 'Stellar', link: 'https://stellar.org', snippet: 'Payments' }],
        }),
      })),
    )
    const handler = await loadHandler()
    const res = makeRes()

    await handler(makeReq(), res as VercelResponse)

    expect(res.statusCode).toBe(200)
    expect(res.body.results).toHaveLength(1)
    expect(res.body.results[0].title).toBe('Stellar')
    expect(res.body.requestId).toBeUndefined()
  })
})
