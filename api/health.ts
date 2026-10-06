import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { handlerElapsedMs, startInvocation } from './invocationMetrics'

const CACHE_SECONDS = 5

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version: APP_VERSION } = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8'),
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const invocation = startInvocation()
  const NETWORK = process.env.STELLAR_NETWORK || 'stellar:testnet'
  const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://www.x402.org/facilitator'
  const SERPER_API_KEY = process.env.SERPER_API_KEY
  const GROQ_API_KEY = process.env.GROQ_API_KEY
  const RECEIVING_ADDRESS = process.env.STELLAR_RECEIVING_ADDRESS

  const body = {
    status: 'ok',
    version: APP_VERSION,
    network: NETWORK,
    pricePerQuery: '0.001 USDC',
    protocol: 'x402',
    facilitator: FACILITATOR_URL,
    serperApiConfigured: !!SERPER_API_KEY,
    groqApiConfigured: !!GROQ_API_KEY,
    receivingAddressConfigured: !!RECEIVING_ADDRESS,
    stats: await getStats(),
    avgLatencyMs: null,
    invocationType: invocation.invocationType,
    coldStartLatencyMs: invocation.coldStartLatencyMs,
    warmHandlerLatencyMs:
      invocation.invocationType === 'warm' ? handlerElapsedMs(invocation) : null,
    timestamp: new Date().toISOString(),
  }

  const etag = `"${Buffer.from(JSON.stringify(body)).toString('base64url')}"`

  res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDS}`)
  res.setHeader('ETag', etag)

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end()
    return
  }

  res.json(body)
}

async function getStats(): Promise<{ searches: number; payments: number } | null> {
  return null
}
