import express from 'express'
import { createPaymentMiddleware } from '../server/payment'
import { AMOUNT_USDC } from '../shared/constants'
import { handleSearch, isPaymentsDisabled, sendResult, validateQuery } from '../server/handlers'
import cors from 'cors'
import { buildCorsOptions } from '../server/corsConfig'
import { handlerElapsedMs, startInvocation } from './invocationMetrics'

const app = express()
const searchPaths = ['/api/search', '/search', '/']

app.use(cors({ ...buildCorsOptions(), preflightContinue: true }))
app.use((req, res, next) => {
  res.locals.invocation = startInvocation()
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const validation = validateQuery(req.query.q)
  if (!validation.ok) return res.status(400).json({ error: validation.error })
  next()
})

const paymentMiddleware = createPaymentMiddleware(Object.fromEntries(
  searchPaths.map(path => [
    `GET ${path}`,
    `StellarSearch: pay-per-query web search - ${AMOUNT_USDC} USDC on Stellar`,
  ]),
))
app.use((req, res, next) => {
  if (isPaymentsDisabled()) return next()
  return paymentMiddleware(req, res, next)
})

app.get(searchPaths, async (req, res) => {
  const query = req.query
  // The SDK has verified this request and buffers its response until settlement.
  // Never treat a client-supplied transaction hash as settlement evidence.
  const result = await handleSearch({
    query: query.q,
    count: typeof query.count === 'string' ? query.count : undefined,
    freshness: typeof query.freshness === 'string' ? query.freshness : undefined,
    suggestions: query.suggestions === '1',
    paymentSignature: req.get('payment-signature') || req.get('x-payment') || null,
    txHash: null,
    resourceUrl: `${req.protocol}://${req.get('host') || ''}${req.originalUrl}`,
  })

  if (result.status === 200 && result.body && typeof result.body === 'object') {
    const invocation = res.locals.invocation
    result.body = {
      ...result.body,
      invocationType: invocation.invocationType,
      coldStartLatencyMs: invocation.coldStartLatencyMs,
      warmHandlerLatencyMs:
        invocation.invocationType === 'warm' ? handlerElapsedMs(invocation) : null,
    }
  }
  sendResult(res, result)
})

export default app
