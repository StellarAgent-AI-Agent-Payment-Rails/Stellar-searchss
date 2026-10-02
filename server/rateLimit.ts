/**
 * Express rate limiters — one per route, plus a global catch-all.
 *
 * Free endpoints (/ai/chat, /health) get the tightest bounds because they cost
 * the operator money or expose internals and are unauthenticated. Paid routes
 * (/search, /images, /news) are looser because x402 already gates them behind
 * a payment.
 */

import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit'
import type { Application, Request, Response } from 'express'

import {
  hasDedicatedLimit,
  loadRateLimitConfig,
  rateLimitPayload,
  type RateLimitConfig,
  type RouteLimitConfig,
} from './rateLimitConfig.js'

/** A no-op middleware used when limiting is disabled, so wiring stays simple. */
const passThrough = ((_req: Request, _res: Response, next) =>
  next()) as RateLimitRequestHandler

function createLimiter(
  scope: string,
  { windowMs, max }: RouteLimitConfig,
  config: RateLimitConfig,
): RateLimitRequestHandler {
  if (!config.enabled) return passThrough

  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Group IPv6 clients by /56 so a single user cannot rotate through their
    // own address block to reset the counter.
    keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? ''),
    handler: (req: Request, res: Response, _next, options) => {
      const info = (req as Request & { rateLimit?: { resetTime: number } }).rateLimit
      const resetTime = info?.resetTime ?? Date.now() + windowMs
      const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))
      const limit = typeof options.limit === 'number' ? options.limit : max

      res.setHeader('Retry-After', String(retryAfter))
      res.status(options.statusCode ?? 429).json(
        rateLimitPayload(scope, limit, windowMs, retryAfter),
      )
    },
  })
}

export interface RateLimiters {
  global: RateLimitRequestHandler
  search: RateLimitRequestHandler
  images: RateLimitRequestHandler
  news: RateLimitRequestHandler
  aiChat: RateLimitRequestHandler
  health: RateLimitRequestHandler
}

/**
 * Builds fresh limiters. A new set is created per call so each app instance
 * gets its own in-memory counters (and tests do not share state).
 */
export function createRateLimiters(config: RateLimitConfig = loadRateLimitConfig()): RateLimiters {
  return {
    global: createLimiter('all endpoints', config.global, config),
    search: createLimiter('GET /search', config.search, config),
    images: createLimiter('GET /images', config.images, config),
    news: createLimiter('GET /news', config.news, config),
    aiChat: createLimiter('POST /ai/chat', config.aiChat, config),
    health: createLimiter('GET /health', config.health, config),
  }
}

/** Sets `trust proxy` and registers every limiter on the app. */
export function installRateLimiting(
  app: Application,
  config: RateLimitConfig = loadRateLimitConfig(),
): RateLimiters {
  app.set('trust proxy', config.trustProxy)

  const limiters = createRateLimiters(config)

  // Order matters: the dedicated limiters mount first so each route is charged
  // only against its own budget, and the global catch-all skips those paths so
  // no request is counted twice. `app.use(path, ...)` also matches sub-paths,
  // which is what we want for `/ai/chat`.
  app.use('/search', limiters.search)
  app.use('/images', limiters.images)
  app.use('/news', limiters.news)
  app.use('/ai/chat', limiters.aiChat)
  app.use('/health', limiters.health)

  app.use((req: Request, res: Response, next) => {
    if (hasDedicatedLimit(req.path)) return next()
    return limiters.global(req, res, next)
  })

  return limiters
}
