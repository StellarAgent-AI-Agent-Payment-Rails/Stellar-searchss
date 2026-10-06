/**
 * CORS configuration — dev uses wildcard; production uses ALLOWED_ORIGINS allowlist.
 *
 * Header case note: the x402 SDK sends the payment signature header as the
 * lowercase `payment-signature` form. HTTP header names are case-insensitive,
 * but the browser preflight `Access-Control-Request-Headers` list is matched
 * case-insensitively by spec-compliant browsers, so we keep only the canonical
 * lowercase form to avoid duplication.
 */

import type { CorsOptions } from 'cors'

/**
 * Request headers the payment flow actually sends.
 *
 * - `Content-Type`: JSON request bodies.
 * - `Authorization`: optional bearer auth on protected routes.
 * - `payment-signature`: the x402 SDK payment signature header (lowercase).
 * - `X-Payment`: legacy x402 payment header still accepted by the server.
 */
const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'payment-signature',
  'X-Payment',
] as const

/**
 * Response headers the client needs to read from the payment flow.
 *
 * - `PAYMENT-REQUIRED`: sent on 402 responses to describe the payment requirements.
 * - `X-Payment-Response`: sent on successful payment settlement responses.
 */
const CORS_EXPOSED_HEADERS = ['PAYMENT-REQUIRED', 'X-Payment-Response'] as const

const CORS_METHODS = ['GET', 'POST', 'OPTIONS'] as const

/**
 * Preflight cache duration in seconds. Paid requests are preflighted only once
 * per cache window instead of on every request.
 */
const CORS_MAX_AGE = 86400

export function parseAllowedOrigins(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function getCorsStartupMessage(): string {
  if (!isProductionEnv()) {
    return 'CORS: * (development)'
  }

  const allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
  if (allowed.length === 0) {
    return 'CORS: allowlist empty — cross-origin browser requests blocked'
  }

  return `CORS: allowlist (${allowed.length} origin${allowed.length === 1 ? '' : 's'})`
}

export function buildCorsOptions(): CorsOptions {
  const base: CorsOptions = {
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
    exposedHeaders: [...CORS_EXPOSED_HEADERS],
    methods: [...CORS_METHODS],
    maxAge: CORS_MAX_AGE,
  }

  if (!isProductionEnv()) {
    return { ...base, origin: '*' }
  }

  const allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)

  if (allowed.length === 0) {
    console.warn(
      '[cors] ALLOWED_ORIGINS is empty in production — blocking cross-origin browser requests',
    )
  }

  return {
    ...base,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }

      callback(null, allowed.includes(origin))
    },
  }
}
