/**
 * apiError.ts
 * Centralised upstream error sanitization.
 *
 * Upstream SDKs (Groq, Serper) embed model identifiers, request fragments and
 * raw provider messages in their thrown errors. Passing those straight through
 * to a public client leaks internal configuration and lets a caller probe the
 * provider. This module centralises the rules so every handler behaves the same:
 *
 *   1. The client always receives a **generic** message plus a `requestId`
 *      correlation token.
 *   2. The full stack + metadata is written to **server-side logs only**.
 *   3. Detailed descriptions are attached to the response **only** when
 *      `NODE_ENV === 'development'`.
 *   4. Secrets are redacted before anything is logged or surfaced in dev.
 */

import { randomUUID } from 'node:crypto'

// ─── Types ───────────────────────────────────────────────────────────────

/** Minimal logger contract so this module works with winston or console. */
export interface ErrorLogger {
  error(message: string, meta?: unknown): unknown
}

export interface UpstreamContext {
  /** Logical operation, e.g. `groq.chat.completions` or `serper.search`. */
  operation: string
  /** Upstream provider label used in the server log line. */
  provider: 'groq' | 'serper' | 'internal'
  /** Safe, non-sensitive metadata for the server log (status, model, ...). */
  meta?: Record<string, unknown>
  /** Optional logger; defaults to `console`. */
  logger?: ErrorLogger
}

export interface ErrorResponseInput extends UpstreamContext {
  /** The thrown value. Never sent to the client outside development. */
  error: unknown
  /** Correlation token to surface to the client. */
  requestId: string
  /** Generic, safe message shown to the client. */
  publicMessage: string
  /** Stable machine-readable code for the client. */
  code?: string
  /** HTTP status to respond with. */
  status?: number
}

export interface ErrorResponsePayload {
  error: string
  requestId: string
  code: string
  /** Development only. Absent in production and staging. */
  details?: string
}

export interface ErrorResponse {
  status: number
  body: ErrorResponsePayload
}

// ─── Environment guard ───────────────────────────────────────────────────

/**
 * Detailed error text is permitted **only** in development. Any other value
 * (production, staging, preview, or an unset NODE_ENV) is treated as
 * non-development, so a misconfigured deploy fails closed.
 */
export function isDetailedErrorsEnabled(): boolean {
  return process.env.NODE_ENV === 'development'
}

// ─── Correlation IDs ─────────────────────────────────────────────────────

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

/** Generate a fresh, non-identifying correlation token. */
export function generateRequestId(): string {
  return randomUUID()
}

/**
 * Reuse an inbound `x-request-id` when it is safe to echo, otherwise mint a
 * new one. Untrusted input is dropped rather than sanitised so a caller cannot
 * inject newlines or fake another request's token in the server logs.
 */
export function resolveRequestId(inbound?: unknown): string {
  if (typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound)) {
    return inbound
  }
  if (Array.isArray(inbound) && inbound.length === 1) {
    const [first] = inbound
    if (typeof first === 'string' && REQUEST_ID_PATTERN.test(first)) return first
  }
  return generateRequestId()
}

// ─── Secret redaction ────────────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  // Provider key formats: gsk_…, sk-…, sk_…, xai-…, re_…, AIza…
  /\b(?:gsk|sk|sk_live|sk_test|xai|re|hf|r8)_[A-Za-z0-9_-]{8,}/gi,
  /\bsk-[A-Za-z0-9]{16,}/gi,
  /\bAIza[A-Za-z0-9_-]{20,}/g,
  // Authorization headers.
  /\b(authorization|x-api-key|api-key|apikey|token|secret)\b(\s*[:=]\s*)("?)([^\s",}]+)\3/gi,
  // Bearer tokens.
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // Stellar secret seeds (must never be logged).
  /\bS[A-Z0-9]{55}\b/g,
]

export const REDACTED = '[REDACTED]'

/** Strip API keys, bearer tokens and wallet secrets from arbitrary text. */
export function redactSecrets(input: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => {
    if (pattern.source.includes('authorization|x-api-key')) {
      return acc.replace(pattern, (_m, label: string, sep: string) => {
        return `${label}${sep}${REDACTED}`
      })
    }
    return acc.replace(pattern, REDACTED)
  }, input)
}

// ─── Error normalisation ─────────────────────────────────────────────────

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  try {
    return new Error(JSON.stringify(error))
  } catch {
    return new Error(String(error))
  }
}

/**
 * Build a redacted, human-readable description of a thrown value. This is
 * server-log and development-only content — never a production response body.
 */
export function describeError(error: unknown): string {
  const err = normalizeError(error)
  const parts: string[] = []

  // SDKs frequently attach a machine-readable name and HTTP status.
  const anyErr = err as unknown as Record<string, unknown>
  if (typeof anyErr.status === 'number') parts.push(`status=${anyErr.status}`)
  if (typeof anyErr.code === 'string') parts.push(`code=${anyErr.code}`)
  if (typeof anyErr.type === 'string') parts.push(`type=${anyErr.type}`)

  const head = parts.length ? `${parts.join(' ')} — ` : ''
  const body = err.stack || err.message || String(err)

  return redactSecrets(`${head}${body}`)
}

// ─── Server-side logging ─────────────────────────────────────────────────

/**
 * Write the full error and its metadata to the server log. The `requestId`
 * written here is the same token returned to the client, so an operator can
 * trace a user report back to the exact upstream failure.
 */
export function logUpstreamError(input: UpstreamContext & { error: unknown; requestId: string }): void {
  const {
    error,
    requestId,
    operation,
    provider,
    meta = {},
    logger = console,
  } = input

  const err = normalizeError(error)
  const anyErr = err as unknown as Record<string, unknown>

  // SDKs attach machine-readable fields that make log triage far easier.
  const sdkFields: Record<string, unknown> = {}
  for (const field of ['status', 'statusCode', 'code', 'type'] as const) {
    if (anyErr[field] !== undefined && anyErr[field] !== null) {
      sdkFields[field] = anyErr[field]
    }
  }

  logger.error(`[${provider}] ${operation} failed (requestId=${requestId})`, {
    requestId,
    provider,
    operation,
    ...sdkFields,
    ...meta,
    errorName: err.name,
    errorMessage: redactSecrets(err.message ?? ''),
    // The stack can quote the raw request (including an Authorization header),
    // so it is redacted like any other log payload.
    stack: redactSecrets(err.stack ?? ''),
    detail: describeError(error),
  })
}

// ─── Response construction ───────────────────────────────────────────────

/**
 * Log the full upstream failure server-side, then build the sanitized payload
 * for the client.
 *
 * In development the payload additionally carries a `details` string so local
 * debugging stays easy. In every other environment the body contains nothing
 * beyond the generic message, the stable code and the correlation ID.
 */
export function buildErrorResponse(input: ErrorResponseInput): ErrorResponse {
  const {
    error,
    requestId,
    publicMessage,
    code = 'upstream_error',
    status = 500,
    operation,
    provider,
    meta,
    logger,
  } = input

  logUpstreamError({ error, requestId, operation, provider, meta, logger })

  const body: ErrorResponsePayload = { error: publicMessage, requestId, code }

  if (isDetailedErrorsEnabled()) {
    body.details = describeError(error)
  }

  return { status, body }
}

/** Build the standard 502 payload for a failed Serper.dev call. */
export function buildUpstreamUnavailableResponse(input: {
  error: unknown
  requestId: string
  operation: string
  provider: 'groq' | 'serper' | 'internal'
  publicMessage: string
  meta?: Record<string, unknown>
  logger?: ErrorLogger
}): ErrorResponse {
  return buildErrorResponse({
    ...input,
    code: 'upstream_unavailable',
    status: 502,
  })
}
