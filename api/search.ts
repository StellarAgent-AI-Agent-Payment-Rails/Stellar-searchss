import express, { type Request, type Response } from 'express'
import { createPaymentMiddleware } from '../server/payment'
import { STELLAR_NETWORK, AMOUNT_USDC } from '../src/lib/constants'

// ─── Config ───────────────────────────────────────────────────────────────
const NETWORK           = STELLAR_NETWORK as 'stellar:testnet' | 'stellar:mainnet'
const SERPER_API_KEY    = process.env.SERPER_API_KEY!
// Keep the upstream local load-test switch; deployed production always pays.
const PAYMENTS_DISABLED = process.env.NODE_ENV === 'development' &&
  process.env.VERCEL_ENV !== 'production' && process.env.PAYMENTS_DISABLED === 'true'

interface SerperResult {
  title?: string
  link: string
  snippet?: string
  date?: string
}

const app = express()
const searchPaths = ['/api/search', '/search', '/']

app.use((req, res, next) => {

  // ─── CORS ─────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', [
    'Content-Type',
    'Authorization',
    'X-Payment',
    'payment-signature',
    'x-payment',
    'X-PAYMENT',
  ].join(', '))
  res.setHeader('Access-Control-Expose-Headers', [
    'PAYMENT-REQUIRED',
    'PAYMENT-RESPONSE',
    'X-Payment-Response',
  ].join(', '))

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  const { q } = req.query
  if (typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'Missing required parameter: q' })
  }
  next()
})

const paymentMiddleware = createPaymentMiddleware(Object.fromEntries(
  searchPaths.map(path => [
    `GET ${path}`,
    `StellarSearch: pay-per-query web search - ${AMOUNT_USDC} USDC on Stellar`,
  ]),
))
app.use((req, res, next) => {
  if (PAYMENTS_DISABLED) return next()
  return paymentMiddleware(req, res, next)
})

app.get(searchPaths, async (req: Request, res: Response) => {
  const { q, count = '5', freshness } = req.query as Record<string, string>

  const t0 = Date.now()

  try {
    // ─── Serper.dev ──────────────────────────────────────────────────────────
    const requestBody: Record<string, unknown> = {
      q:   q.trim(),
      num: Math.min(parseInt(count) || 5, 20),
    }

    if (freshness) {
      const dateFilters: Record<string, string> = {
        pd: 'qdr:d',  // past day
        pw: 'qdr:w',  // past week
        pm: 'qdr:m',  // past month
      }
      if (dateFilters[freshness]) requestBody.tbs = dateFilters[freshness]
    }

    const serperRes = await fetch('https://google.serper.dev/search', {
      method:  'POST',
      headers: {
        'X-API-KEY':    SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!serperRes.ok) {
      const errText = await serperRes.text()
      console.error('[serper]', serperRes.status, errText)
      return res.status(502).json({ error: `Serper.dev API error: ${serperRes.status}` })
    }

    const data = await serperRes.json() as { organic?: SerperResult[] }
    const latencyMs = Date.now() - t0

    const results = (data.organic || []).map((r, i) => ({
      id:             String(i + 1),
      title:          r.title   || 'No title',
      url:            r.link,
      description:    r.snippet || '',
      source:         (() => {
        try { return new URL(r.link).hostname.replace('www.', '') }
        catch { return r.link }
      })(),
      relevanceScore: Math.max(0.5, 1 - i * 0.06),
      publishedAt:    r.date || undefined,
    }))

    return res.json({
      query:      q.trim(),
      results,
      count:      results.length,
      network:    NETWORK,
      paidAmount: AMOUNT_USDC,
      currency:   'USDC',
      txHash: null,
      latencyMs,
    })

  } catch (err: unknown) {
    console.error('[search error]', err instanceof Error ? err.message : 'Unknown error')
    return res.status(500).json({ error: 'Search failed.' })
  }
})

export default app
