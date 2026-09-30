import type { VercelRequest, VercelResponse } from '@vercel/node'

import { loadRateLimitConfig } from '../server/rateLimitConfig.js'
import { rateLimitGuard } from './rateLimit.js'

const rateLimitConfig = loadRateLimitConfig()
const limited = rateLimitGuard('GET /api/health', rateLimitConfig.health, rateLimitConfig)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (await limited(req, res)) return

  const NETWORK = process.env.STELLAR_NETWORK || 'stellar:testnet'
  const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://www.x402.org/facilitator'
  const SERPER_API_KEY = process.env.SERPER_API_KEY
  const GROQ_API_KEY = process.env.GROQ_API_KEY
  const RECEIVING_ADDRESS = process.env.STELLAR_RECEIVING_ADDRESS

  res.json({
    status: 'ok',
    network: NETWORK,
    pricePerQuery: '0.001 USDC',
    protocol: 'x402',
    facilitator: FACILITATOR_URL,
    serperApiConfigured: !!SERPER_API_KEY,
    groqApiConfigured: !!GROQ_API_KEY,
    receivingAddressConfigured: !!RECEIVING_ADDRESS,
    timestamp: new Date().toISOString(),
  })
}