/**
 * Rate limiting for the Vercel serverless handlers in `api/`.
 *
 * The handlers are raw `(req, res)` functions rather than Express apps, so we
 * adapt them to the shape `express-rate-limit` expects: supply `req.ip` from
 * the Vercel-provided forwarding headers and stub `req.app.get('trust proxy')`
 * so the library's proxy validation passes. Limits and the 429 body come from
 * the same config as the Express server (server/rateLimitConfig.ts).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit'

import {
  loadRateLimitConfig,
  rateLimitPayload,
  type RateLimitConfig,
  type RouteLimitConfig,
} from '../server/rateLimitConfig.js'

/**
 * Vercel terminates TLS and forwards the request, so the originating client is
 * the right-most trustworthy entry of `x-forwarded-for`. `x-real-ip` is used as
 * a fallback for local `vercel dev` runs.
 */
export function clientIpFromVercelRequest(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const chain = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? ''))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (chain.length > 0) return chain[chain.length - 1]

  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()

  return req.socket?.remoteAddress ?? 'unknown'
}

type AdaptedRequest = VercelRequest & {
  app: { get: (key: string) => unknown }
  ip: string
}

function adaptRequest(req: VercelRequest, trustProxy: number | string | false): AdaptedRequest {
  const adapted = req as AdaptedRequest
  if (!adapted.app) {
    adapted.app = { get: (key: string) => (key === 'trust proxy' ? trustProxy : undefined) }
  }
  Object.defineProperty(adapted, 'ip', {
    value: clientIpFromVercelRequest(req),
    configurable: true,
  })
  return adapted
}

function createLimiter(
  scope: string,
  { windowMs, max }: RouteLimitConfig,
  config: RateLimitConfig,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit: config.enabled ? max : Number.POSITIVE_INFINITY,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Group IPv6 clients by /56 so one user cannot rotate through their own
    // address block to reset the counter.
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
    handler: (req, res, _next, options) => {
      const info = (req as { rateLimit?: { resetTime: number } }).rateLimit
      const resetTime = info?.resetTime ?? Date.now() + windowMs
      const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))
      const limit = typeof options.limit === 'number' ? options.limit : max

      res.setHeader('Retry-After', String(retryAfter))
      res.status(options.statusCode ?? 429).json(
        rateLimitPayload(scope, limit, windowMs, retryAfter),
      )
    },
    // Serverless instances are recycled constantly, so the in-memory store is
    // best effort. Never let a store hiccup take the endpoint down.
    passOnStoreError: true,
  })
}

/**
 * Builds a guard for a Vercel handler. Call it before any real work; when it
 * resolves `true` the request has already been answered with a 429 and the
 * handler should return immediately.
 */
export function rateLimitGuard(
  scope: string,
  routeLimit: RouteLimitConfig,
  config: RateLimitConfig = loadRateLimitConfig(),
) {
  const limiter = createLimiter(scope, routeLimit, config)

  return async function guard(req: VercelRequest, res: VercelResponse): Promise<boolean> {
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }

      limiter(
        adaptRequest(req, config.trustProxy) as unknown as Parameters<typeof limiter>[0],
        res as never,
        done,
      )
      // `res.once` is absent on the minimal response doubles used by
      // tests/parity.test.ts, so guard the registration rather than assume a
      // full http.ServerResponse. The limiter has already settled the promise
      // by the time this runs for an allowed request.
      res.once?.('finish', done)
      res.once?.('close', done)
    })

    return res.statusCode === 429
  }
}
