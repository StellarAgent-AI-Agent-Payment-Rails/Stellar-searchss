/**
 * Rate limit configuration — single source of truth shared by the Express
 * server (server/rateLimit.ts) and the Vercel serverless handlers
 * (api/rateLimit.ts).
 *
 * Every value is env-tunable so deployments can loosen or tighten limits
 * without a code change. See .env.example for the documented variables.
 */

export interface RouteLimitConfig {
  windowMs: number
  max: number
}

export interface RateLimitConfig {
  enabled: boolean
  trustProxy: number | string | false
  global: RouteLimitConfig
  search: RouteLimitConfig
  images: RouteLimitConfig
  news: RouteLimitConfig
  aiChat: RouteLimitConfig
  health: RouteLimitConfig
}

/**
 * Paths that have their own dedicated limiter. The global limiter skips these
 * so a request is only counted once against the limit that actually applies.
 */
/** Paths that have a dedicated limiter, mapped to their config scope. */
export const DEDICATED_LIMIT_PATHS = {
  '/search': 'search',
  '/images': 'images',
  '/news': 'news',
  '/ai/chat': 'aiChat',
  '/health': 'health',
} as const

export const DEDICATED_LIMIT_PATH_LIST = Object.keys(DEDICATED_LIMIT_PATHS) as Array<
  keyof typeof DEDICATED_LIMIT_PATHS
>

export const DEFAULT_WINDOW_MS = 60_000

/**
 * Paid routes (/search, /images, /news) get the loosest bounds: every call
 * costs the caller 0.001 USDC, so the x402 payment itself already deters abuse
 * and we do not want to throttle paying agents.
 */
export type LimitScope = 'search' | 'images' | 'news' | 'aiChat' | 'health' | 'global'

/** Maps each scope to the environment variable that tunes it. */
const ENV_KEYS: Record<LimitScope, string> = {
  global: 'RATE_LIMIT_GLOBAL_MAX',
  search: 'RATE_LIMIT_SEARCH_MAX',
  images: 'RATE_LIMIT_IMAGES_MAX',
  news: 'RATE_LIMIT_NEWS_MAX',
  aiChat: 'RATE_LIMIT_AI_CHAT_MAX',
  health: 'RATE_LIMIT_HEALTH_MAX',
}

export const DEFAULT_LIMITS: Record<LimitScope, number> = {
  global: 300,
  search: 60,
  images: 60,
  news: 60,
  /** Free endpoint backed by Groq — costs us money on every request. */
  aiChat: 20,
  /** Free and unauthenticated: only monitors should be calling it. */
  health: 30,
}

/**
 * How many proxy hops sit in front of the app. Vercel terminates TLS and
 * forwards to the function over one additional hop, so the real client IP is
 * the last entry of `X-Forwarded-For` that Express should read.
 *
 * `true` is deliberately rejected: it lets any client spoof `X-Forwarded-For`
 * and bypass the limit entirely (express-rate-limit raises
 * ERR_ERL_PERMISSIVE_TRUST_PROXY for it).
 */
export const DEFAULT_TRUST_PROXY = 1

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    console.warn(
      `[rate-limit] ignoring invalid positive integer "${raw}" — falling back to ${fallback}`,
    )
    return fallback
  }
  return parsed
}

export function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(value)) return true
  if (['0', 'false', 'no', 'off'].includes(value)) return false
  console.warn(`[rate-limit] ignoring invalid boolean "${raw}" — falling back to ${fallback}`)
  return fallback
}

/**
 * Express `trust proxy` accepts a hop count, a comma separated subnet list, or
 * a named preset. `true` is refused because it makes IP based limiting
 * trivially bypassable.
 */
export function parseTrustProxy(raw: string | undefined): number | string | false {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRUST_PROXY

  const value = raw.trim()

  if (['true', 'false'].includes(value.toLowerCase())) {
    console.warn(
      '[rate-limit] TRUST_PROXY must be a hop count or subnet list, not a boolean — using the default of 1',
    )
    return DEFAULT_TRUST_PROXY
  }

  if (/^\d+$/.test(value)) return Number(value)

  if (['loopback', 'linklocal', 'uniquelocal'].includes(value.toLowerCase())) {
    return value.toLowerCase()
  }

  // Treat anything else as a comma separated CIDR/subnet allowlist.
  if (value.includes(',') || value.includes('/') || value.includes('.')) return value

  console.warn(
    `[rate-limit] ignoring invalid TRUST_PROXY "${raw}" — using the default of ${DEFAULT_TRUST_PROXY}`,
  )
  return DEFAULT_TRUST_PROXY
}

export function loadRateLimitConfig(
  env: NodeJS.ProcessEnv = process.env,
): RateLimitConfig {
  const windowMs = parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS)
  const scope = (key: LimitScope): RouteLimitConfig => ({
    windowMs,
    max: parsePositiveInt(env[ENV_KEYS[key]], DEFAULT_LIMITS[key]),
  })

  return {
    enabled: parseBoolean(env.RATE_LIMIT_ENABLED, true),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    global: scope('global'),
    search: scope('search'),
    images: scope('images'),
    news: scope('news'),
    aiChat: scope('aiChat'),
    health: scope('health'),
  }
}

export function hasDedicatedLimit(path: string): boolean {
  return DEDICATED_LIMIT_PATH_LIST.includes(path as never)
}

/** Consistent JSON body for every rate limited response. */
export function rateLimitPayload(
  scope: string,
  max: number,
  windowMs: number,
  retryAfterSeconds: number,
): Record<string, unknown> {
  return {
    error: 'Too many requests, please try again later.',
    code: 'RATE_LIMITED',
    message: `Rate limit exceeded for ${scope}. Retry in ${retryAfterSeconds}s.`,
    scope,
    limit: max,
    windowMs,
    retryAfter: retryAfterSeconds,
  }
}
