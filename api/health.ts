import type { VercelRequest, VercelResponse } from '@vercel/node'
import { EMPTY_HEALTH_STATS, handleHealth, sendResult } from '../server/handlers'
import { buildCorsHeaders } from '../server/corsConfig'

// GET /api/health — thin adapter over the shared health handler. The payload,
// ETag and Cache-Control match the Express /health route exactly; a serverless
// process has no live counters, so it reports a zeroed stats snapshot.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  for (const [name, value] of Object.entries(
    buildCorsHeaders(req.headers.origin as string | undefined),
  )) {
    res.setHeader(name, value)
  }

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const ifNoneMatch = req.headers['if-none-match']

  return sendResult(
    res,
    handleHealth({
      ifNoneMatch: Array.isArray(ifNoneMatch) ? ifNoneMatch[0] : ifNoneMatch,
      stats: EMPTY_HEALTH_STATS,
    }),
  )
}
