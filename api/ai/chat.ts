import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleChat,
  parseChatMessages,
  pipeChatStream,
  sendResult,
  wantsStream,
} from '../../server/handlers'
import { buildCorsHeaders } from '../../server/corsConfig'

// POST /api/ai/chat — thin adapter over the shared chat handlers. Streams
// Server-Sent Events when the client asks for them (Accept header or
// ?stream=1), otherwise returns the full completion as JSON. The SSE framing
// is the same code the Express route uses.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  for (const [name, value] of Object.entries(
    buildCorsHeaders(req.headers.origin as string | undefined),
  )) {
    res.setHeader(name, value)
  }

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const header = (name: string): string | undefined => {
    const value = req.headers?.[name]
    return Array.isArray(value) ? value[0] : value
  }
  const messages = parseChatMessages(req.body)
  if (!messages) return res.status(400).json({ error: 'messages array required' })

  if (!wantsStream(req.headers.accept, req.query.stream)) {
    return sendResult(res, await handleChat({ messages, requestIdHeader: header('x-request-id') }))
  }

  await pipeChatStream(res, messages, process.env, header('x-request-id'))
}
