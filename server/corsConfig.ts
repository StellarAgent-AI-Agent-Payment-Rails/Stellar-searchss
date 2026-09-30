/**
 * CORS configuration — dev uses wildcard; production uses ALLOWED_ORIGINS allowlist.
 */

import type { CorsOptions } from 'cors'
import cors from 'cors'
import type { Request, Response } from 'express'

const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Payment',
  'payment-signature',
  'x-payment',
  'X-PAYMENT',
] as const

const CORS_EXPOSED_HEADERS = [
  'PAYMENT-REQUIRED',
  'X-Payment-Response',
] as const

const CORS_METHODS = ['GET', 'POST', 'OPTIONS'] as const

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

/** Apply the shared CORS policy to Vercel handlers without ending preflight requests. */
export function applyServerlessCors(req: unknown, res: unknown): Promise<void> {
  const middleware = cors({ ...buildCorsOptions(), preflightContinue: true })

  return new Promise((resolve, reject) => {
    middleware(req as Request, res as Response, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}
