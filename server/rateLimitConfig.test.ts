import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LIMITS,
  DEFAULT_TRUST_PROXY,
  DEFAULT_WINDOW_MS,
  DEDICATED_LIMIT_PATH_LIST,
  hasDedicatedLimit,
  loadRateLimitConfig,
  parseBoolean,
  parsePositiveInt,
  parseTrustProxy,
  rateLimitPayload,
} from './rateLimitConfig.js'

describe('parsePositiveInt', () => {
  it('falls back when unset or blank', () => {
    expect(parsePositiveInt(undefined, 7)).toBe(7)
    expect(parsePositiveInt('   ', 7)).toBe(7)
  })

  it('parses valid integers', () => {
    expect(parsePositiveInt('42', 7)).toBe(42)
    expect(parsePositiveInt(' 10 ', 7)).toBe(10)
  })

  it('falls back for zero, negatives and non-integers', () => {
    expect(parsePositiveInt('0', 7)).toBe(7)
    expect(parsePositiveInt('-5', 7)).toBe(7)
    expect(parsePositiveInt('1.5', 7)).toBe(7)
    expect(parsePositiveInt('abc', 7)).toBe(7)
  })
})

describe('parseBoolean', () => {
  it('accepts common truthy and falsy spellings', () => {
    for (const raw of ['1', 'true', 'TRUE', 'yes', 'on']) {
      expect(parseBoolean(raw, false)).toBe(true)
    }
    for (const raw of ['0', 'false', 'FALSE', 'no', 'off']) {
      expect(parseBoolean(raw, true)).toBe(false)
    }
  })

  it('falls back on junk', () => {
    expect(parseBoolean('maybe', true)).toBe(true)
    expect(parseBoolean(undefined, false)).toBe(false)
  })
})

describe('parseTrustProxy', () => {
  it('defaults to a single hop (Vercel terminates TLS in front of us)', () => {
    expect(parseTrustProxy(undefined)).toBe(DEFAULT_TRUST_PROXY)
    expect(parseTrustProxy('')).toBe(DEFAULT_TRUST_PROXY)
  })

  it('accepts an explicit hop count', () => {
    expect(parseTrustProxy('2')).toBe(2)
  })

  it('accepts named presets and subnet lists', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback')
    expect(parseTrustProxy('uniquelocal')).toBe('uniquelocal')
    expect(parseTrustProxy('10.0.0.0/8, 192.168.0.0/16')).toBe('10.0.0.0/8, 192.168.0.0/16')
  })

  it('refuses `true`, which would let clients spoof X-Forwarded-For', () => {
    expect(parseTrustProxy('true')).toBe(DEFAULT_TRUST_PROXY)
    expect(parseTrustProxy('TRUE')).toBe(DEFAULT_TRUST_PROXY)
  })

  it('falls back on nonsense', () => {
    expect(parseTrustProxy('nonsense')).toBe(DEFAULT_TRUST_PROXY)
  })

  it('never resolves to boolean true', () => {
    for (const raw of [undefined, '', 'true', 'false', 'bogus', '3']) {
      expect(parseTrustProxy(raw)).not.toBe(true)
    }
  })
})

describe('hasDedicatedLimit', () => {
  it('matches the per-route paths', () => {
    for (const path of DEDICATED_LIMIT_PATH_LIST) {
      expect(hasDedicatedLimit(path)).toBe(true)
    }
  })

  it('does not match unrelated paths', () => {
    expect(hasDedicatedLimit('/')).toBe(false)
    expect(hasDedicatedLimit('/favicon.ico')).toBe(false)
  })
})

describe('loadRateLimitConfig', () => {
  it('returns safe defaults with an empty environment', () => {
    const config = loadRateLimitConfig({})

    expect(config.enabled).toBe(true)
    expect(config.trustProxy).toBe(DEFAULT_TRUST_PROXY)
    expect(config.global.max).toBe(DEFAULT_LIMITS.global)
    expect(config.search.max).toBe(DEFAULT_LIMITS.search)
    expect(config.images.max).toBe(DEFAULT_LIMITS.images)
    expect(config.news.max).toBe(DEFAULT_LIMITS.news)
    expect(config.aiChat.max).toBe(DEFAULT_LIMITS.aiChat)
    expect(config.health.max).toBe(DEFAULT_LIMITS.health)
  })

  it('keeps free endpoints tighter than paid routes', () => {
    const config = loadRateLimitConfig({})

    expect(config.aiChat.max).toBeLessThan(config.search.max)
    expect(config.aiChat.max).toBeLessThan(config.images.max)
    expect(config.aiChat.max).toBeLessThan(config.news.max)
    expect(config.health.max).toBeLessThan(config.search.max)
    expect(config.global.max).toBeGreaterThan(config.search.max)
  })

  it('reads every documented environment override', () => {
    const config = loadRateLimitConfig({
      RATE_LIMIT_ENABLED: 'false',
      RATE_LIMIT_WINDOW_MS: '5000',
      TRUST_PROXY: '3',
      RATE_LIMIT_GLOBAL_MAX: '11',
      RATE_LIMIT_SEARCH_MAX: '12',
      RATE_LIMIT_IMAGES_MAX: '13',
      RATE_LIMIT_NEWS_MAX: '14',
      RATE_LIMIT_AI_CHAT_MAX: '15',
      RATE_LIMIT_HEALTH_MAX: '16',
    })

    expect(config.enabled).toBe(false)
    expect(config.trustProxy).toBe(3)
    expect(config.global).toEqual({ windowMs: 5000, max: 11 })
    expect(config.search).toEqual({ windowMs: 5000, max: 12 })
    expect(config.images).toEqual({ windowMs: 5000, max: 13 })
    expect(config.news).toEqual({ windowMs: 5000, max: 14 })
    expect(config.aiChat).toEqual({ windowMs: 5000, max: 15 })
    expect(config.health).toEqual({ windowMs: 5000, max: 16 })
  })

  it('ignores invalid overrides rather than disabling protection', () => {
    const config = loadRateLimitConfig({
      RATE_LIMIT_SEARCH_MAX: 'lots',
      RATE_LIMIT_AI_CHAT_MAX: '-1',
      RATE_LIMIT_WINDOW_MS: 'soon',
    })

    expect(config.search.max).toBe(DEFAULT_LIMITS.search)
    expect(config.aiChat.max).toBe(DEFAULT_LIMITS.aiChat)
    expect(config.search.windowMs).toBe(DEFAULT_WINDOW_MS)
  })
})

describe('rateLimitPayload', () => {
  it('produces a stable JSON 429 body', () => {
    expect(rateLimitPayload('GET /health', 30, 60_000, 42)).toEqual({
      error: 'Too many requests, please try again later.',
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded for GET /health. Retry in 42s.',
      scope: 'GET /health',
      limit: 30,
      windowMs: 60_000,
      retryAfter: 42,
    })
  })
})
