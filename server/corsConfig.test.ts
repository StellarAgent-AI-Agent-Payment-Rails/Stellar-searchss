import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyServerlessCors } from './corsConfig'

function createResponse() {
  const headers = new Map<string, string>()

  return {
    headers,
    getHeader(name: string) {
      return headers.get(name.toLowerCase())
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value)
    },
  }
}

test('production serverless CORS only reflects allowlisted origins', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS

  process.env.NODE_ENV = 'production'
  process.env.ALLOWED_ORIGINS = 'https://app.example.com, https://admin.example.com'

  try {
    const allowedResponse = createResponse()
    await applyServerlessCors(
      { headers: { origin: 'https://app.example.com' }, method: 'GET' },
      allowedResponse,
    )
    assert.equal(
      allowedResponse.headers.get('access-control-allow-origin'),
      'https://app.example.com',
    )

    const blockedResponse = createResponse()
    await applyServerlessCors(
      { headers: { origin: 'https://attacker.example' }, method: 'GET' },
      blockedResponse,
    )
    assert.equal(blockedResponse.headers.has('access-control-allow-origin'), false)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv

    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
  }
})

test('development serverless CORS retains wildcard behavior', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'

  try {
    const response = createResponse()
    await applyServerlessCors(
      { headers: { origin: 'https://any-origin.example' }, method: 'GET' },
      response,
    )
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
