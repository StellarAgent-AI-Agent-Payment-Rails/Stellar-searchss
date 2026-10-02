import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { parseHealthResponse } from '../src/types'

test('GET /health matches the shared response contract', async () => {
  process.env.NODE_ENV = 'test'
  process.env.GROQ_API_KEY = 'test-key'

  const { default: app } = await import('./index')
  const server = app.listen(0)
  await once(server, 'listening')

  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')

    const response = await fetch(`http://127.0.0.1:${address.port}/health`)
    assert.equal(response.status, 200)
    const health = parseHealthResponse(await response.json())

    assert.equal(health.status, 'ok')
    assert.equal(health.protocol, 'x402')
  } finally {
    server.close()
    await once(server, 'close')
  }
})