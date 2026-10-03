import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type RequestHandler } from 'express'
import type { PaymentRequirements } from '@x402/core/types'

const originalFetch = globalThis.fetch
const savedEnv = { ...process.env }
const recipient = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
let server: Server
let baseUrl: string
let requirements: PaymentRequirements
let verifyValid = false
let settleSuccess = true
let facilitatorUnavailable = false
let serperStatus = 200
let serperCalls = 0
let verifyBodies: Record<string, unknown>[] = []
let settleBodies: Record<string, unknown>[] = []

before(async () => {
  process.env.STELLAR_RECEIVING_ADDRESS = recipient
  process.env.STELLAR_NETWORK = 'stellar:testnet'
  process.env.FACILITATOR_URL = 'https://facilitator.invalid'
  process.env.SERPER_API_KEY = 'test-only-key'
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init)
    if (url === 'https://facilitator.invalid/supported') {
      return Response.json({
        kinds: [{ x402Version: 2, scheme: 'exact', network: 'stellar:testnet', extra: { areFeesSponsored: true } }],
        extensions: [],
        signers: {},
      })
    }
    if (url === 'https://facilitator.invalid/verify') {
      verifyBodies.push(JSON.parse(String(init?.body)))
      if (facilitatorUnavailable) return Response.json({ error: 'unavailable' }, { status: 503 })
      return Response.json(verifyValid
        ? { isValid: true, payer: recipient }
        : { isValid: false, invalidReason: 'invalid_signature' })
    }
    if (url === 'https://facilitator.invalid/settle') {
      settleBodies.push(JSON.parse(String(init?.body)))
      return Response.json({
        success: settleSuccess,
        errorReason: settleSuccess ? undefined : 'settlement_failed',
        transaction: settleSuccess ? 'settled-transaction' : '',
        network: 'stellar:testnet',
        payer: recipient,
      })
    }
    if (url === 'https://google.serper.dev/search') {
      serperCalls++
      return Response.json({ organic: [{ title: 'Paid result', link: 'https://example.com', snippet: 'Search result' }] }, { status: serperStatus })
    }
    throw new Error(`Unexpected network request: ${url}`)
  }
  const { default: handler } = await import('../api/search')
  const app = express()
  app.use(handler as unknown as RequestHandler)
  server = await new Promise<Server>(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const response = await fetch(`${baseUrl}/api/search?q=stellar`)
  assert.equal(response.status, 402)
  const challenge = JSON.parse(Buffer.from(response.headers.get('payment-required')!, 'base64').toString())
  requirements = challenge.accepts[0]
})

beforeEach(() => {
  verifyValid = false
  settleSuccess = true
  facilitatorUnavailable = false
  serperStatus = 200
  serperCalls = 0
  verifyBodies = []
  settleBodies = []
})

after(async () => {
  globalThis.fetch = originalFetch
  process.env = savedEnv
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})

function paymentHeader(accepted = requirements) {
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted,
    payload: { signature: 'forged-signature' },
    txHash: 'untrusted-client-hash',
  })).toString('base64')
}

test('rejects a malformed payment header without calling search', async () => {
  const response = await fetch(`${baseUrl}/api/search?q=stellar`, { headers: { 'payment-signature': 'not-a-payment' } })
  assert.equal(response.status, 402)
  assert.equal(serperCalls, 0)
  assert.equal(settleBodies.length, 0)
})

test('rejects a forged payment through SDK facilitator verification', async () => {
  const header = paymentHeader()
  const response = await fetch(`${baseUrl}/api/search?q=stellar`, { headers: { 'payment-signature': header } })
  assert.equal(response.status, 402)
  assert.equal(verifyBodies.length, 1)
  assert.deepEqual(verifyBodies[0].paymentRequirements, requirements)
  assert.deepEqual(verifyBodies[0].paymentPayload, JSON.parse(Buffer.from(header, 'base64').toString()))
  assert.equal(serperCalls, 0)
  assert.equal(settleBodies.length, 0)
})

test('rejects forged legacy X-Payment headers rather than trusting their presence', async () => {
  const response = await fetch(`${baseUrl}/api/search?q=stellar`, { headers: { 'X-Payment': paymentHeader() } })
  assert.equal(response.status, 402)
  assert.equal(settleBodies.length, 0)
  assert.equal(serperCalls, 0)
})

test('does not accept tampered payment requirements', async () => {
  const response = await fetch(`${baseUrl}/api/search?q=stellar`, {
    headers: { 'payment-signature': paymentHeader({ ...requirements, amount: '1' }) },
  })
  assert.equal(response.status, 402)
  assert.equal(verifyBodies.length, 0)
  assert.equal(serperCalls, 0)
})

test('returns SDK payment requirements when no payment is present', async () => {
  const response = await fetch(`${baseUrl}/api/search?q=stellar`)
  assert.equal(response.status, 402)
  const challenge = JSON.parse(Buffer.from(response.headers.get('payment-required')!, 'base64').toString())
  assert.equal(challenge.x402Version, 2)
  assert.equal(challenge.accepts[0].payTo, recipient)
  assert.equal(challenge.accepts[0].amount, '10000')
  assert.equal(challenge.accepts[0].network, 'stellar:testnet')
  assert.equal(challenge.accepts[0].asset, 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA')
  assert.equal(serperCalls, 0)
})

test('returns paid results only after SDK verification and settlement succeed', async () => {
  verifyValid = true
  const response = await fetch(`${baseUrl}/api/search?q=stellar`, { headers: { 'payment-signature': paymentHeader() } })
  assert.equal(response.status, 200)
  assert.equal(verifyBodies.length, 1)
  assert.equal(settleBodies.length, 1)
  assert.deepEqual(settleBodies[0].paymentRequirements, requirements)
  const settlement = JSON.parse(Buffer.from(response.headers.get('payment-response')!, 'base64').toString())
  assert.equal(settlement.transaction, 'settled-transaction')
  const body = await response.json() as { results: { title: string }[]; txHash: string | null }
  assert.equal(body.results[0].title, 'Paid result')
  assert.equal(body.txHash, null)
  assert.equal(serperCalls, 1)
  assert.match(response.headers.get('access-control-expose-headers')!, /PAYMENT-RESPONSE/i)
})

test('withholds search results when settlement fails', async () => {
  verifyValid = true
  settleSuccess = false
  const response = await fetch(`${baseUrl}/api/search?q=stellar`, { headers: { 'payment-signature': paymentHeader() } })
  assert.equal(response.status, 402)
  assert.equal(settleBodies.length, 1)
  const body = await response.json() as { results?: unknown }
  assert.equal(body.results, undefined)
})

test('fails closed when the facilitator is unavailable', async () => {
  facilitatorUnavailable = true
  const response = await fetch(`${baseUrl}/api/search?q=stellar`, { headers: { 'payment-signature': paymentHeader() } })
  assert.equal(response.status, 402)
  assert.equal(verifyBodies.length, 1)
  assert.equal(serperCalls, 0)
  assert.equal(settleBodies.length, 0)
})

test('does not settle a failed search', async () => {
  verifyValid = true
  serperStatus = 502
  const response = await fetch(`${baseUrl}/api/search?q=stellar`, { headers: { 'payment-signature': paymentHeader() } })
  assert.equal(response.status, 502)
  assert.equal(settleBodies.length, 0)
})

test('preflight and unsupported methods bypass payment processing', async () => {
  const preflight = await fetch(`${baseUrl}/api/search`, { method: 'OPTIONS' })
  assert.equal(preflight.status, 200)
  const post = await fetch(`${baseUrl}/api/search`, { method: 'POST' })
  assert.equal(post.status, 405)
  const head = await fetch(`${baseUrl}/api/search?q=stellar`, { method: 'HEAD' })
  assert.equal(head.status, 405)
  assert.equal(verifyBodies.length, 0)
  assert.equal(serperCalls, 0)
})

test('all supported URL aliases require payment', async () => {
  for (const path of ['/api/search', '/search', '/']) {
    const response = await fetch(`${baseUrl}${path}?q=stellar`, {
      headers: { 'payment-signature': paymentHeader() },
    })
    assert.equal(response.status, 402)
  }
  assert.equal(verifyBodies.length, 3)
  assert.equal(serperCalls, 0)
})

test('route variants cannot bypass the SDK payment guard', async () => {
  for (const path of ['/API/search', '/api/search/', '/api/other']) {
    const response = await fetch(`${baseUrl}${path}?q=stellar`)
    assert.ok(response.status >= 400)
  }
  assert.equal(serperCalls, 0)
})
