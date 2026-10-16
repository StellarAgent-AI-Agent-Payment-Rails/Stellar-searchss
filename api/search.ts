import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlerElapsedMs, startInvocation } from './invocationMetrics'
import { handleSearch, sendResult } from '../server/handlers'
import { buildCorsHeaders } from '../server/corsConfig'

// GET /api/search — thin adapter over the shared search handler. All
// validation, payment-requirement and Serper logic lives in
// server/handlers.ts so this route and Express GET /search cannot drift.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const invocation = startInvocation()
  for (const [name, value] of Object.entries(
    buildCorsHeaders(req.headers.origin as string | undefined),
  )) {
    res.setHeader(name, value)
  }

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const header = (name: string): string | undefined => {
    const value = req.headers[name]
    return Array.isArray(value) ? value[0] : value
  }
  const query = req.query as Record<string, string | string[] | undefined>

  const result = await handleSearch({
    query: query.q,
    count: typeof query.count === 'string' ? query.count : undefined,
    freshness: typeof query.freshness === 'string' ? query.freshness : undefined,
    suggestions: query.suggestions === '1',
    paymentSignature: header('payment-signature') || header('x-payment') || null,
    txHash: header('x-payment-response') || null,
    resourceUrl: `${header('x-forwarded-proto') || 'http'}://${header('host') || ''}${req.url || ''}`,
    requestIdHeader: header('x-request-id') ?? null,
  })

  if (result.status === 200 && result.body && typeof result.body === 'object') {
    result.body = {
      ...result.body,
      invocationType: invocation.invocationType,
      coldStartLatencyMs: invocation.coldStartLatencyMs,
      warmHandlerLatencyMs:
        invocation.invocationType === 'warm' ? handlerElapsedMs(invocation) : null,
    }
  }

  return sendResult(res, result)
}
