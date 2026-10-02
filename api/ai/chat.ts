import type { VercelRequest, VercelResponse } from '@vercel/node'
import Groq from 'groq-sdk'
import { applyServerlessCors } from '../../server/corsConfig'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

const GROQ_MODEL = 'llama-3.3-70b-versatile'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

// The Vercel body helper throws when the request contains malformed JSON,
// which would otherwise surface as an unhandled 500 instead of a 400.
function readMessages(req: VercelRequest): ChatMessage[] | null {
  try {
    const { messages } = (req.body ?? {}) as { messages?: ChatMessage[] }
    return messages?.length ? messages : null
  } catch {
    return null
  }
}

// Mirrors server/index.ts POST /ai/chat: streams Server-Sent Events when the
// client asks for them (Accept header or ?stream=1), otherwise returns the
// full completion as JSON for callers that don't support SSE.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await applyServerlessCors(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

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

  // Abort the Groq stream when the client disconnects mid-response. The
  // request's own 'close' event fires as soon as its body is consumed, so
  // disconnects are detected on the response instead: ServerResponse emits
  // 'close' with writableEnded === false only when the client went away
  // before the response completed. Vercel additionally surfaces disconnects
  // as request errors when supportsCancellation is enabled (vercel.json).
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  req.on('error', () => controller.abort())

  try {
    const stream = await groq.chat.completions.create(
      {
        model: GROQ_MODEL,
        messages: groqMessages,
        max_tokens: 512,
        temperature: 0.7,
        stream: true,
      },
      { signal: controller.signal },
    )

    let model = GROQ_MODEL
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (chunk.model) model = chunk.model
      if (delta) sendEvent('delta', { content: delta })
    }
    sendEvent('done', { model })
    res.end()
  } catch (err: any) {
    if (controller.signal.aborted) return res.end()
    console.error('[groq stream error]', err.message)
    sendEvent('error', { error: `Groq AI error: ${err.message}` })
    res.end()
  }
}
