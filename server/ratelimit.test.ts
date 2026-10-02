import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import { createRateLimiter } from './ratelimit.ts'

function makeReq(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request
}

function makeRes() {
  const res: any = { headers: {} as Record<string, string>, statusCode: 200, body: undefined }
  res.setHeader = (key: string, value: string) => {
    res.headers[key.toLowerCase()] = value
    return res
  }
  res.getHeader = (key: string) => res.headers[key.toLowerCase()]
  res.status = (code: number) => {
    res.statusCode = code
    return res
  }
  res.json = (body: unknown) => {
    res.body = body
    return res
  }
  return res
}

test('requests under the limit succeed', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 })
  let nextCalls = 0
  const next = () => {
    nextCalls += 1
  }

  for (let i = 0; i < 3; i += 1) {
    const res = makeRes()
    limiter(makeReq('1.2.3.4'), res as unknown as Response, next)
    assert.equal(res.statusCode, 200)
  }

  assert.equal(nextCalls, 3)
})

test('exceeding the limit returns 429 with a Retry-After header', () => {
  let current = 0
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => current })
  let nextCalls = 0
  const next = () => {
    nextCalls += 1
  }

  limiter(makeReq('1.2.3.4'), makeRes() as unknown as Response, next)
  limiter(makeReq('1.2.3.4'), makeRes() as unknown as Response, next)

  current = 10_000 // still inside the 60s window
  const blocked = makeRes()
  limiter(makeReq('1.2.3.4'), blocked as unknown as Response, next)

  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.headers['retry-after'], '50') // ceil((60_000 - 10_000) / 1000)
  assert.equal(nextCalls, 2) // the blocked request never reached the handler
  assert.match(String(blocked.body?.error), /too many requests/i)
})

test('the window resets once it elapses', () => {
  let current = 0
  const limiter = createRateLimiter({ windowMs: 1_000, max: 1, now: () => current })
  let nextCalls = 0
  const next = () => {
    nextCalls += 1
  }

  limiter(makeReq('9.9.9.9'), makeRes() as unknown as Response, next) // allowed
  const blocked = makeRes()
  limiter(makeReq('9.9.9.9'), blocked as unknown as Response, next) // blocked
  assert.equal(blocked.statusCode, 429)

  current = 1_000 // window elapsed
  const allowedAgain = makeRes()
  limiter(makeReq('9.9.9.9'), allowedAgain as unknown as Response, next)

  assert.equal(allowedAgain.statusCode, 200)
  assert.equal(nextCalls, 2)
})

test('limits are keyed per IP, not globally', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
  const next = () => {}

  // Exhaust the budget for the first IP.
  limiter(makeReq('10.0.0.1'), makeRes() as unknown as Response, next)
  const firstBlocked = makeRes()
  limiter(makeReq('10.0.0.1'), firstBlocked as unknown as Response, next)
  assert.equal(firstBlocked.statusCode, 429)

  // A different IP still has its own, untouched budget.
  const otherIp = makeRes()
  limiter(makeReq('10.0.0.2'), otherIp as unknown as Response, next)
  assert.equal(otherIp.statusCode, 200)

  assert.equal(limiter.size(), 2)
})

test('reset() clears a single key or every key', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
  const next = () => {}

  limiter(makeReq('a'), makeRes() as unknown as Response, next)
  limiter(makeReq('b'), makeRes() as unknown as Response, next)
  assert.equal(limiter.size(), 2)

  limiter.reset('a')
  assert.equal(limiter.size(), 1)

  limiter.reset()
  assert.equal(limiter.size(), 0)
})
