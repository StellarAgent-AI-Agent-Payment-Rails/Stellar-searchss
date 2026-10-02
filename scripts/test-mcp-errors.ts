import assert from 'node:assert/strict'

process.env.GROQ_API_KEY = 'test-key'
const { getSafeToolErrorMessage, reportToolError } = await import('../mcp-server/index')

const originalError = console.error
const stderr: unknown[][] = []
console.error = (...args: unknown[]) => stderr.push(args)

try {
  const cases = [
    [new Error('fetch failed for https://internal.example.test/search'), 'network/request'],
    [new Error('Invalid API key: sk-live-secret'), 'authentication/configuration'],
    [new Error('upstream returned https://internal.example.test/api?token=secret'), 'upstream service'],
    [new Error('Account not found for invalid address'), 'invalid request'],
    [{ code: 'E_INTERNAL', detail: 'unexpected implementation failure' }, 'unexpected internal'],
  ] as const

  for (const [error, category] of cases) {
    const output = getSafeToolErrorMessage('Test tool', error)
    assert.match(output, new RegExp(`Test tool failed: ${category} error`))
    assert.notEqual(output.includes(String(error)), true)
    assert.equal(output.includes('https://internal.example.test'), false)
    assert.equal(output.includes('secret'), false)
  }

  const credentialBearingError = new Error('request failed at https://user:password@example.test/?access_token=secret')
  const result = reportToolError('Search', credentialBearingError)
  assert.equal(result.isError, true)
  assert.equal(result.content[0].text.includes('password'), false)
  assert.equal(result.content[0].text.includes('access_token'), false)
  assert.equal(result.content[0].text.includes('secret'), false)
  assert.equal(stderr.length, 1)
  assert.equal(stderr[0][0], '[MCP Search]')
  assert.equal(stderr[0][1], credentialBearingError)

  console.log('MCP error handling tests passed')
} finally {
  console.error = originalError
}
