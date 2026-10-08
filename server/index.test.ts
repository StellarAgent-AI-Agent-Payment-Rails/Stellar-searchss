import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

process.env.NODE_ENV = 'production'
process.env.GROQ_API_KEY ??= 'test-key'
process.env.STELLAR_RECEIVING_ADDRESS ??= 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

const { validateQuery } = await import('./index.js')

describe('validateQuery', () => {
  it('rejects empty, whitespace-only, and non-string queries', () => {
    assert.deepEqual(validateQuery(''), {
      ok: false,
      error: 'Missing required parameter: q',
    })
    assert.deepEqual(validateQuery(' \t\n '), {
      ok: false,
      error: 'Missing required parameter: q',
    })
    assert.deepEqual(validateQuery(undefined), {
      ok: false,
      error: 'Missing required parameter: q',
    })
  })

  it('rejects queries longer than 256 characters before sanitization', () => {
    assert.deepEqual(validateQuery('a'.repeat(257)), {
      ok: false,
      error: 'Query too long. Maximum 256 characters.',
    })
    assert.deepEqual(validateQuery('a'.repeat(256)), {
      ok: true,
      cleanQ: 'a'.repeat(256),
    })
  })

  it('strips ASCII C0 controls and DEL, then trims the result', () => {
    assert.deepEqual(validateQuery('  sta\x01r\x7ftle\n search  '), {
      ok: true,
      cleanQ: 'startle search',
    })
  })

  it('strips null bytes', () => {
    assert.deepEqual(validateQuery('stellar\x00search'), {
      ok: true,
      cleanQ: 'stellarsearch',
    })
  })

  it('rejects queries containing only control characters', () => {
    assert.deepEqual(validateQuery('\x00\x01\x1f\x7f'), {
      ok: false,
      error: 'Query contains no valid characters.',
    })
  })

  it('preserves unicode and ordinary valid input', () => {
    assert.deepEqual(validateQuery('  café 🪐 search  '), {
      ok: true,
      cleanQ: 'café 🪐 search',
    })
  })
})