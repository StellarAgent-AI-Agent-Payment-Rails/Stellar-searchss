import type { NextFunction, Request, Response } from 'express'

export interface RateLimitOptions {
  /** Length of the fixed window in milliseconds. */
  windowMs: number
  /** Maximum number of requests allowed per key, per window. */
  max: number
  /**
   * Clock used to stamp windows. Injectable so tests can advance time
   * deterministically instead of sleeping.
   */
  now?: () => number
  /**
   * Derives the bucket key for a request. Defaults to the client IP so limits
   * are enforced per caller rather than globally.
   */
  keyGenerator?: (req: Request) => string
  /** Body returned in the 429 response. */
  message?: string
}

interface Bucket {
  count: number
  resetAt: number
}

export interface RateLimiter {
  (req: Request, res: Response, next: NextFunction): void
  /** Clear one key (or every key when called without an argument). */
  reset(key?: string): void
  /** Number of keys currently tracked (observability/tests). */
  size(): number
}

/**
 * Minimal in-memory, per-key fixed-window rate limiter.
 *
 * Designed for the unauthenticated, cost-bearing endpoints (Groq / SSRF-guarded
 * fetching). It is intentionally dependency-free and synchronous so it can sit
 * in front of a route without adding latency. Keys are derived from the client
 * IP by default, so one noisy caller cannot exhaust the budget for everyone.
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max } = options
  const now = options.now ?? (() => Date.now())
  const keyGenerator =
    options.keyGenerator ?? ((req: Request) => req.ip || req.socket?.remoteAddress || 'unknown')
  const message = options.message ?? 'Too many requests, please try again later.'

  const buckets = new Map<string, Bucket>()

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req)
    const current = now()

    let bucket = buckets.get(key)
    // A missing bucket, or one whose window has elapsed, starts a fresh window.
    if (!bucket || current >= bucket.resetAt) {
      bucket = { count: 0, resetAt: current + windowMs }
      buckets.set(key, bucket)
    }

    if (bucket.count >= max) {
      // Round up so the client always waits at least one whole second; never 0.
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000))
      res.setHeader('Retry-After', String(retryAfterSeconds))
      res.status(429).json({ error: message, retryAfterSeconds })
      return
    }

    bucket.count += 1
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))
    next()
  }

  middleware.reset = (key?: string): void => {
    if (key === undefined) buckets.clear()
    else buckets.delete(key)
  }

  middleware.size = (): number => buckets.size

  return middleware
}
