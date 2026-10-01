import type { VercelRequest, VercelResponse } from '@vercel/node'
import Groq from 'groq-sdk'
import {
  buildErrorResponse,
  resolveRequestId,
} from '../../src/lib/apiError'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

const GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const messages = readMessages(req)
  if (!messages) {
    return res.status(400).json({ error: 'messages array required' })
  }

  const groqMessages = [
    {
      role: 'system' as const,
      content:
        'You are StellarSearch AI, a concise research assistant. Help users craft better search queries and understand results. Keep responses under 200 words.',
    },
    ...messages,
  ]

  const wantsStream =
    (req.headers.accept || '').includes('text/event-stream') ||
    req.query.stream === '1'

  if (!wantsStream) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: groqMessages,
        max_tokens: 512,
        temperature: 0.7,
      })

      const content = completion.choices[0]?.message?.content || 'No response.'
      return res.json({ content, model: completion.model })
    } catch (err: any) {
      console.error('[groq error]', err.message)
      return res.status(500).json({ error: `Groq AI error: ${err.message}` })
    }
  }

  // SSE path — the Node.js runtime flushes ServerResponse writes as they
  // happen; the no-buffering headers stop intermediaries from re-buffering.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Swallow EPIPE-style errors when the client vanishes mid-stream.
  res.on('error', () => {})

  const sendEvent = (event: string, data: Record<string, unknown>) => {
    if (res.writableEnded) return
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Correlation token: echoed to the client and used in the server log so a
  // user-reported failure maps to a single server-side entry.
  const requestId = resolveRequestId(req.headers['x-request-id'])
  res.setHeader('X-Request-Id', requestId)

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are StellarSearch AI, a concise research assistant. Help users craft better search queries and understand results. Keep responses under 200 words.',
        },
        ...messages,
      ],
      max_tokens: 512,
      temperature: 0.7,
    })

    const content = completion.choices[0]?.message?.content || 'No response.'
    return res.json({ content, model: completion.model })
  } catch (err: unknown) {
    // The raw Groq SDK message may contain model identifiers and request
    // fragments, so it is logged server-side only. The client receives a
    // generic message plus the correlation ID.
    const failure = buildErrorResponse({
      error: err,
      requestId,
      operation: 'groq.chat.completions',
      provider: 'groq',
      publicMessage: 'The AI assistant is temporarily unavailable. Please try again shortly.',
      code: 'ai_unavailable',
      status: 500,
      meta: { model: GROQ_CHAT_MODEL, mode: 'vercel-json' },
    })
    return res.status(failure.status).json(failure.body)
  }
}
