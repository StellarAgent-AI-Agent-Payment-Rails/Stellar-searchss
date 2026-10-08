import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { installRateLimiting } from './rateLimit.js'
import { loadRateLimitConfig, type RateLimitConfig } from './rateLimitConfig.js'

/** Small limits keep the tests fast while still exercising the limiter. */
function testConfig(overrides: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return {
    enabled: true,
    trustProxy: 1,
    global: { windowMs: 60_000, max: 5 },
    search: { windowMs: 60_000, max: 3 },
    images: { windowMs: 60_000, max: 3 },
    news: { windowMs: 60_000, max: 3 },
    aiChat: { windowMs: 60_000, max: 2 },
    health: { windowMs: 60_000, max: 2 },
    ...overrides,
  }
}

function buildApp(config: RateLimitConfig = testConfig()) {
  const app = express()
  app.use(express.json())
  installRateLimiting(app, config)

  app.get('/search', (_req, res) => res.json({ ok: true }))
  app.get('/images', (_req, res) => res.json({ ok: true }))
  app.get('/news', (_req, res) => res.json({ ok: true }))
  app.post('/ai/chat', (_req, res) => res.json({ ok: true }))
  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.get('/', (_req, res) => res.json({ ok: true }))

  return app
}

describe('installRateLimiting', () => {
  let app: express.Application

  beforeEach(() => {
    app = buildApp()
  })

  it('sets trust proxy so the real client IP is used behind Vercel', () => {
    expect(app.get('trust proxy')).toBe(1)
  })

  it('honours a custom trust proxy hop count', () => {
    const custom = buildApp(testConfig({ trustProxy: 2 }))
    expect(custom.get('trust proxy')).toBe(2)
  })

  it('keys on the forwarded client IP, not the proxy IP', async () => {
    const single = buildApp(testConfig({ health: { windowMs: 60_000, max: 1 } }))

    const first = await request(single).get('/health').set('X-Forwarded-For', '203.0.113.10')
    const second = await request(single).get('/health').set('X-Forwarded-For', '203.0.113.10')
    const other = await request(single).get('/health').set('X-Forwarded-For', '198.51.100.7')

    expect(first.status).toBe(200)
    // Second request from the same forwarded IP shares the bucket.
    expect(second.status).toBe(429)
    // A different client keeps its own allowance.
    expect(other.status).toBe(200)
  })

  it('returns a clean JSON 429 with Retry-After and RateLimit headers', async () => {
    await request(app).get('/health')
    await request(app).get('/health')

    const res = await request(app).get('/health')

    expect(res.status).toBe(429)
    expect(res.type).toBe('application/json')
    expect(res.body).toMatchObject({
      error: 'Too many requests, please try again later.',
      code: 'RATE_LIMITED',
      scope: 'GET /health',
      limit: 2,
      windowMs: 60_000,
    })
    expect(typeof res.body.retryAfter).toBe('number')
    expect(res.body.retryAfter).toBeGreaterThan(0)
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    expect(res.headers['ratelimit']).toBeDefined()
  })

  it('does not run the route handler once the limit is hit', async () => {
    let handled = 0
    const limited = express()
    installRateLimiting(limited, testConfig())
    limited.get('/health', (_req, res) => {
      handled += 1
      res.json({ ok: true })
    })

    await request(limited).get('/health')
    await request(limited).get('/health')
    const third = await request(limited).get('/health')

    expect(handled).toBe(2)
    expect(third.status).toBe(429)
  })

  const freeRoutes = [
    { name: 'GET /health', path: '/health', max: 2 },
    { name: 'POST /ai/chat', path: '/ai/chat', max: 2 },
  ] as const

  for (const route of freeRoutes) {
    it(`applies a per-route limit to the free endpoint ${route.name}`, async () => {
      const method = route.name.startsWith('POST') ? 'post' : 'get'

      for (let i = 0; i < route.max; i++) {
        const res = await request(app)[method](route.path)
        expect(res.status).toBe(200)
      }

      const blocked = await request(app)[method](route.path)
      expect(blocked.status).toBe(429)
      expect(blocked.body.scope).toBe(route.name)
    })
  }

  const paidRoutes = ['/search', '/images', '/news'] as const

  for (const path of paidRoutes) {
    it(`applies a per-route limit to the paid endpoint GET ${path}`, async () => {
      for (let i = 0; i < 3; i++) {
        const res = await request(app).get(path)
        expect(res.status).toBe(200)
      }

      const blocked = await request(app).get(path)
      expect(blocked.status).toBe(429)
      expect(blocked.body.scope).toBe(`GET ${path}`)
    })
  }

  it('keeps per-route budgets independent', async () => {
    for (let i = 0; i < 3; i++) await request(app).get('/search')

    expect((await request(app).get('/search')).status).toBe(429)
    // Exhausting /search must not consume the /news or global allowance.
    expect((await request(app).get('/news')).status).toBe(200)
    expect((await request(app).get('/')).status).toBe(200)
  })

  it('does not let a dedicated route exhaust the global budget', async () => {
    const shared = buildApp(testConfig({ global: { windowMs: 60_000, max: 3 } }))

    // /search allows 3, global allows 3. Both budgets are spent independently.
    for (let i = 0; i < 3; i++) await request(shared).get('/search')
    for (let i = 0; i < 3; i++) await request(shared).get('/')

    expect((await request(shared).get('/search')).status).toBe(429)
    expect((await request(shared).get('/')).status).toBe(429)
  })

  it('applies a global catch-all to unrouted paths', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/')
      expect(res.status).toBe(200)
    }

    const blocked = await request(app).get('/')
    expect(blocked.status).toBe(429)
    expect(blocked.body.scope).toBe('all endpoints')
  })

  it('does not double-count a request against the global budget', async () => {
    // /search allows 3, the global allows 5. If the request were also counted
    // globally, the 4th /search call would still be fine but a mixed pattern
    // would trip early.
    for (let i = 0; i < 3; i++) await request(app).get('/search')

    for (let i = 0; i < 5; i++) await request(app).get('/')

    expect((await request(app).get('/')).status).toBe(429)
  })

  it('allows all traffic through when limiting is disabled', async () => {
    const open = buildApp(testConfig({ enabled: false }))

    for (let i = 0; i < 20; i++) {
      const res = await request(open).get('/health')
      expect(res.status).toBe(200)
    }
  })

  it('produces independent counters per app instance', async () => {
    const a = buildApp(testConfig({ health: { windowMs: 60_000, max: 1 } }))
    const b = buildApp(testConfig({ health: { windowMs: 60_000, max: 1 } }))

    expect((await request(a).get('/health')).status).toBe(200)
    expect((await request(a).get('/health')).status).toBe(429)
    expect((await request(b).get('/health')).status).toBe(200)
  })
})

describe('loadRateLimitConfig integration', () => {
  it('builds limiters straight from the environment', async () => {
    const app = express()
    installRateLimiting(app, loadRateLimitConfig({
      RATE_LIMIT_HEALTH_MAX: '1',
      TRUST_PROXY: '1',
    }))
    app.get('/health', (_req, res) => res.json({ ok: true }))

    expect((await request(app).get('/health')).status).toBe(200)
    const blocked = await request(app).get('/health')
    expect(blocked.status).toBe(429)
    expect(blocked.body.limit).toBe(1)
  })
})
