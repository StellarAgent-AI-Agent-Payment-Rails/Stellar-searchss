import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app, { rateLimitConfig } from '../server/index.js'

/**
 * End-to-end checks against the real server app: the limiters must be mounted
 * in front of the x402 payment middleware so an unpaid flood is rejected with
 * 429 rather than being allowed to hammer the payment path.
 *
 * The limits here come from the test environment, so they are small enough to
 * exhaust quickly without touching Serper or Groq.
 */
describe('server rate limiting (integration)', () => {
  it('exposes the resolved configuration', () => {
    expect(rateLimitConfig.enabled).toBe(true)
    expect(rateLimitConfig.trustProxy).toBe(1)
  })

  it('sets trust proxy on the app', () => {
    expect(app.get('trust proxy')).toBe(rateLimitConfig.trustProxy)
  })

  it('still serves GET /health within the limit', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('exhausts GET /health and then returns a JSON 429', async () => {
    const max = rateLimitConfig.health.max

    for (let i = 0; i < max; i++) {
      const res = await request(app).get('/health').set('X-Forwarded-For', '203.0.113.50')
      expect(res.status).toBe(200)
    }

    const blocked = await request(app).get('/health').set('X-Forwarded-For', '203.0.113.50')

    expect(blocked.status).toBe(429)
    expect(blocked.type).toBe('application/json')
    expect(blocked.body).toMatchObject({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      scope: 'GET /health',
      limit: max,
    })
    expect(blocked.headers['retry-after']).toBeDefined()
  })

  it('rate limits POST /ai/chat before it reaches Groq', async () => {
    const max = rateLimitConfig.aiChat.max

    // No messages array is sent, so the handler would 400 — but the limiter
    // still counts and eventually rejects with 429.
    for (let i = 0; i < max; i++) {
      const res = await request(app)
        .post('/ai/chat')
        .set('X-Forwarded-For', '203.0.113.51')
        .send({})
      expect(res.status).toBe(400)
    }

    const blocked = await request(app)
      .post('/ai/chat')
      .set('X-Forwarded-For', '203.0.113.51')
      .send({})

    expect(blocked.status).toBe(429)
    expect(blocked.body.scope).toBe('POST /ai/chat')
  })

  it('rate limits the paid routes before the 402 challenge', async () => {
    const max = rateLimitConfig.search.max

    for (let i = 0; i < max; i++) {
      const res = await request(app)
        .get('/search?q=stellar')
        .set('X-Forwarded-For', '203.0.113.52')
      // Unpaid requests get the x402 challenge until the limit trips.
      expect(res.status).toBe(402)
    }

    const blocked = await request(app)
      .get('/search?q=stellar')
      .set('X-Forwarded-For', '203.0.113.52')

    expect(blocked.status).toBe(429)
    expect(blocked.body.scope).toBe('GET /search')
    expect(blocked.headers['payment-required']).toBeUndefined()
  })

  it('keys paid routes on the forwarded client IP', async () => {
    const max = rateLimitConfig.images.max

    for (let i = 0; i < max; i++) {
      await request(app).get('/images?q=stellar').set('X-Forwarded-For', '203.0.113.53')
    }
    expect(
      (await request(app).get('/images?q=stellar').set('X-Forwarded-For', '203.0.113.53')).status,
    ).toBe(429)

    // A different client is unaffected.
    expect(
      (await request(app).get('/images?q=stellar').set('X-Forwarded-For', '198.51.100.53')).status,
    ).toBe(402)
  })

  it('keeps the free /news and root routes independent of each other', async () => {
    const res = await request(app).get('/news?q=stellar').set('X-Forwarded-For', '203.0.113.54')
    expect(res.status).toBe(402)

    const root = await request(app).get('/').set('X-Forwarded-For', '203.0.113.54')
    expect(root.status).toBe(200)
    expect(root.body.name).toBe('StellarSearch')
  })
})
