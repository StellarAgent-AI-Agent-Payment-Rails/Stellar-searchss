import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describe, expect, it } from 'vitest'

import { clientIpFromVercelRequest, rateLimitGuard } from './rateLimit.js'
import { loadRateLimitConfig } from '../server/rateLimitConfig.js'

/**
 * Minimal stand-in for a Vercel serverless response. The real one is an
 * http.ServerResponse with Express-style helpers layered on top.
 */
class FakeResponse {
  statusCode = 200
  headers: Record<string, string> = {}
  body: unknown = undefined
  private listeners: Record<string, Array<() => void>> = {}

  setHeader(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value
    return this
  }

  status(code: number): this {
    this.statusCode = code
    return this
  }

  json(payload: unknown): this {
    this.body = payload
    this.emit('finish')
    return this
  }

  once(event: string, listener: () => void): this {
    ;(this.listeners[event] ??= []).push(listener)
    return this
  }

  on(event: string, listener: () => void): this {
    return this.once(event, listener)
  }

  emit(event: string): void {
    for (const listener of this.listeners[event] ?? []) listener()
  }
}

function fakeRequest(headers: Record<string, string | string[]> = {}): VercelRequest {
  return {
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as VercelRequest
}

function config(max: number) {
  return loadRateLimitConfig({
    RATE_LIMIT_SEARCH_MAX: String(max),
    RATE_LIMIT_AI_CHAT_MAX: String(max),
    RATE_LIMIT_HEALTH_MAX: String(max),
  })
}

function newResponse(): { res: VercelResponse; state: FakeResponse } {
  const state = new FakeResponse()
  return { res: state as unknown as VercelResponse, state }
}

describe('clientIpFromVercelRequest', () => {
  it('uses the right-most x-forwarded-for entry', () => {
    const req = fakeRequest({ 'x-forwarded-for': '203.0.113.9, 198.51.100.2' })
    expect(clientIpFromVercelRequest(req)).toBe('198.51.100.2')
  })

  it('handles an array header', () => {
    const req = fakeRequest({ 'x-forwarded-for': ['203.0.113.9', '198.51.100.2'] })
    expect(clientIpFromVercelRequest(req)).toBe('198.51.100.2')
  })

  it('falls back to x-real-ip then the socket address', () => {
    expect(clientIpFromVercelRequest(fakeRequest({ 'x-real-ip': '198.51.100.4' }))).toBe(
      '198.51.100.4',
    )
    expect(clientIpFromVercelRequest(fakeRequest({}))).toBe('127.0.0.1')
  })
})

describe('rateLimitGuard', () => {
  it('lets traffic through below the limit', async () => {
    const settings = config(2)
    const guard = rateLimitGuard('GET /api/search', settings.search, settings)
    const { res, state } = newResponse()

    expect(await guard(fakeRequest(), res)).toBe(false)
    expect(state.statusCode).toBe(200)
  })

  it('answers with a JSON 429 once the limit is exceeded', async () => {
    const settings = config(2)
    const guard = rateLimitGuard('GET /api/search', settings.search, settings)

    await guard(fakeRequest(), newResponse().res)
    await guard(fakeRequest(), newResponse().res)

    const { res, state } = newResponse()
    const limited = await guard(fakeRequest(), res)

    expect(limited).toBe(true)
    expect(state.statusCode).toBe(429)
    expect(state.headers['retry-after']).toBeDefined()
    expect(state.body).toMatchObject({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      scope: 'GET /api/search',
      limit: 2,
    })
  })

  it('tracks each client IP separately', async () => {
    const settings = config(1)
    const guard = rateLimitGuard('GET /api/search', settings.search, settings)

    const a = newResponse()
    const a2 = newResponse()
    const b = newResponse()

    expect(await guard(fakeRequest({ 'x-forwarded-for': '203.0.113.1' }), a.res)).toBe(false)
    expect(await guard(fakeRequest({ 'x-forwarded-for': '203.0.113.1' }), a2.res)).toBe(true)
    expect(await guard(fakeRequest({ 'x-forwarded-for': '198.51.100.1' }), b.res)).toBe(false)
  })

  it('passes everything when limiting is disabled', async () => {
    const settings = { ...config(1), enabled: false }
    const guard = rateLimitGuard('POST /api/ai/chat', settings.aiChat, settings)

    for (let i = 0; i < 25; i++) {
      const { res, state } = newResponse()
      expect(await guard(fakeRequest(), res)).toBe(false)
      expect(state.statusCode).toBe(200)
    }
  })
})
