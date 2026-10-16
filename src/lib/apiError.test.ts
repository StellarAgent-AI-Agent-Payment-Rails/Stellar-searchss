import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildErrorResponse,
  buildUpstreamUnavailableResponse,
  describeError,
  isDetailedErrorsEnabled,
  logUpstreamError,
  redactSecrets,
  resolveRequestId,
  REDACTED,
} from './apiError'

const ORIGINAL_ENV = process.env.NODE_ENV

function makeLogger() {
  return { error: vi.fn() }
}

beforeEach(() => {
  process.env.NODE_ENV = 'production'
})

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV
  vi.restoreAllMocks()
})

describe('isDetailedErrorsEnabled', () => {
  it('allows detail only in development', () => {
    process.env.NODE_ENV = 'development'
    expect(isDetailedErrorsEnabled()).toBe(true)
  })

  it.each(['production', 'staging', 'preview', 'test', ''])(
    'denies detail when NODE_ENV=%o',
    (value) => {
      process.env.NODE_ENV = value
      expect(isDetailedErrorsEnabled()).toBe(false)
    },
  )

  it('fails closed when NODE_ENV is undefined', () => {
    delete process.env.NODE_ENV
    expect(isDetailedErrorsEnabled()).toBe(false)
  })
})

describe('resolveRequestId', () => {
  it('reuses a safe inbound correlation token', () => {
    expect(resolveRequestId('req_abc-123')).toBe('req_abc-123')
  })

  it('mints a new token when the inbound value is unsafe', () => {
    const forged = 'bad id with spaces'
    const id = resolveRequestId(forged)
    expect(id).not.toBe(forged)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('drops inbound values that could inject log newlines', () => {
    const id = resolveRequestId('abc\ndef')
    expect(id).not.toContain('\n')
  })

  it('rejects an over-long inbound token', () => {
    const id = resolveRequestId('a'.repeat(65))
    expect(id).not.toBe('a'.repeat(65))
  })

  it('mints a token when none is supplied', () => {
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('redactSecrets', () => {
  it('redacts Groq-style keys', () => {
    expect(redactSecrets('key=gsk_abcdefgh12345678')).toContain(REDACTED)
  })

  it('redacts bearer tokens', () => {
    expect(redactSecrets('Authorization: Bearer sk-abc123def456ghi789')).not.toContain(
      'sk-abc123def456ghi789',
    )
  })

  it('redacts api key headers', () => {
    const out = redactSecrets('x-api-key: serper_live_0123456789abcdef')
    expect(out).not.toContain('serper_live_0123456789abcdef')
  })

  it('redacts Stellar secret seeds', () => {
    const seed = 'S' + 'A'.repeat(55)
    expect(redactSecrets(`seed=${seed}`)).toContain(REDACTED)
  })
})

describe('describeError', () => {
  it('includes the stack and SDK status code', () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 })
    const detail = describeError(err)
    expect(detail).toContain('status=429')
    expect(detail).toContain('rate limited')
  })

  it('redacts secrets embedded in the error message', () => {
    const err = new Error('auth failed for gsk_abcdefgh12345678')
    expect(describeError(err)).not.toContain('gsk_abcdefgh12345678')
  })

  it('handles a thrown string', () => {
    expect(describeError('boom')).toContain('boom')
  })
})

describe('buildErrorResponse (production)', () => {
  const groqError = Object.assign(
    new Error(
      'Error code: 429 - {"error":{"message":"Rate limit reached for model llama-3.3-70b-versatile"}}',
    ),
    { status: 429 },
  )

  it('does not leak the upstream SDK message to the client', () => {
    const failure = buildErrorResponse({
      error: groqError,
      requestId: 'req_test',
      operation: 'groq.chat.completions',
      provider: 'groq',
      publicMessage: 'The AI assistant is temporarily unavailable. Please try again shortly.',
    })

    expect(failure.status).toBe(500)
    expect(failure.body.error).toBe('The AI assistant is temporarily unavailable. Please try again shortly.')
    expect(failure.body.requestId).toBe('req_test')
    expect(failure.body.code).toBe('upstream_error')
  })

  it('omits the model identifier and raw SDK text in production', () => {
    const failure = buildErrorResponse({
      error: groqError,
      requestId: 'req_test',
      operation: 'groq.chat.completions',
      provider: 'groq',
      publicMessage: 'generic',
    })

    const serialized = JSON.stringify(failure.body)
    expect(serialized).not.toContain('llama-3.3-70b-versatile')
    expect(serialized).not.toContain('429')
    expect(serialized).not.toContain('Rate limit reached')
    expect(failure.body.details).toBeUndefined()
  })

  it('does not leak the Serper status code or response body', () => {
    const failure = buildUpstreamUnavailableResponse({
      error: new Error('Serper.dev responded 403: {"message":"Not enough credits"}'),
      requestId: 'req_test',
      operation: 'serper.search',
      provider: 'serper',
      publicMessage: 'Search is temporarily unavailable. Please try again shortly.',
    })

    const serialized = JSON.stringify(failure.body)
    expect(failure.status).toBe(502)
    expect(serialized).not.toContain('403')
    expect(serialized).not.toContain('Not enough credits')
    expect(failure.body.code).toBe('upstream_unavailable')
  })

  it('logs the full error and metadata server-side with the same requestId', () => {
    const logger = makeLogger()
    buildErrorResponse({
      error: groqError,
      requestId: 'req_test',
      operation: 'groq.chat.completions',
      provider: 'groq',
      publicMessage: 'generic',
      meta: { model: 'llama-3.3-70b-versatile', mode: 'json' },
      logger,
    })

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [message, meta] = logger.error.mock.calls[0] as [string, Record<string, unknown>]
    expect(message).toContain('req_test')
    expect(meta.requestId).toBe('req_test')
    expect(meta.status).toBe(429)
    expect(meta.model).toBe('llama-3.3-70b-versatile')
    expect(String(meta.stack)).toContain('Rate limit reached')
  })

  it('redacts secrets before they reach the server log', () => {
    const logger = makeLogger()
    buildErrorResponse({
      error: new Error('rejected key gsk_abcdefgh12345678'),
      requestId: 'req_test',
      operation: 'groq.chat.completions',
      provider: 'groq',
      publicMessage: 'generic',
      logger,
    })

    const [, meta] = logger.error.mock.calls[0] as [string, Record<string, unknown>]
    expect(JSON.stringify(meta)).not.toContain('gsk_abcdefgh12345678')
  })
})

describe('buildErrorResponse (development)', () => {
  it('includes redacted details only in development', () => {
    process.env.NODE_ENV = 'development'
    const failure = buildErrorResponse({
      error: new Error('Error code: 429 for model llama-3.3-70b-versatile key gsk_abcdefgh12345678'),
      requestId: 'req_test',
      operation: 'groq.chat.completions',
      provider: 'groq',
      publicMessage: 'generic',
    })

    expect(failure.body.details).toBeDefined()
    expect(failure.body.details).toContain('llama-3.3-70b-versatile')
    expect(failure.body.details).not.toContain('gsk_abcdefgh12345678')
  })
})

describe('logUpstreamError', () => {
  it('falls back to console when no logger is provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logUpstreamError({
      error: new Error('kaboom'),
      requestId: 'req_console',
      operation: 'groq.chat.completions',
      provider: 'groq',
    })
    expect(spy).toHaveBeenCalled()
  })
})
