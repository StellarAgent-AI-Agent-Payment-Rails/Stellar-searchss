import { describe, it, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let mockCreateImpl: any = async () => ({
  choices: [{ message: { content: 'Default mock response' } }],
  model: 'llama-3.3-70b-versatile',
})

vi.mock('groq-sdk', () => {
  return {
    default: class MockGroq {
      chat = {
        completions: {
          create: async (body: any, options: any) => {
            if (options?.signal?.aborted) {
              const err = new Error('Aborted')
              err.name = 'AbortError'
              throw err
            }
            return mockCreateImpl(body, options)
          },
        },
      }
    },
  }
})

process.env.NODE_ENV = 'production'
process.env.GROQ_API_KEY = 'test-groq-key'
process.env.STELLAR_RECEIVING_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

const app = (await import('./index.js')).default

let server: Server
let baseUrl: string

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  mockCreateImpl = async () => ({
    choices: [{ message: { content: 'Default mock response' } }],
    model: 'llama-3.3-70b-versatile',
  })
})

describe('POST /ai/chat SSE and fallback', () => {
  it('produces correctly framed SSE events when Accept: text/event-stream', async () => {
    mockCreateImpl = async (body: any) => {
      if (body.stream) {
        return (async function* () {
          yield { choices: [{ delta: { content: 'Stream chunk 1' } }] }
          yield { choices: [{ delta: { content: ' Stream chunk 2' } }] }
        })()
      }
      return {
        choices: [{ message: { content: 'JSON' } }],
        model: 'llama-3.3-70b-versatile',
      }
    }

    const res = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello SSE' }],
      }),
    })

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/event-stream')

    const text = await res.text()
    assert.equal(
      text,
      'event: delta\ndata: {"content":"Stream chunk 1"}\n\n' +
        'event: delta\ndata: {"content":" Stream chunk 2"}\n\n' +
        'event: done\ndata: {"model":"llama-3.3-70b-versatile"}\n\n',
    )
  })

  it('returns JSON completion when Accept: text/event-stream is not provided', async () => {
    mockCreateImpl = async () => ({
      choices: [{ message: { content: 'JSON response content' } }],
      model: 'llama-3.3-70b-versatile',
    })

    const res = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello JSON' }],
      }),
    })

    assert.equal(res.status, 200)
    assert.ok(res.headers.get('content-type')?.includes('application/json'))

    const json = await res.json() as any
    assert.equal(json.content, 'JSON response content')
    assert.equal(json.model, 'llama-3.3-70b-versatile')
  })

  it('produces an error event and closes the stream when upstream Groq fails', async () => {
    mockCreateImpl = async () => {
      throw new Error('Groq service unavailable')
    }

    const res = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Trigger error' }],
      }),
    })

    assert.equal(res.status, 200)
    const text = await res.text()
    assert.equal(
      text,
      'event: error\ndata: {"error":"Groq AI error: Groq service unavailable"}\n\n',
    )
  })

  it('aborts the upstream Groq stream when client disconnects mid-stream', async () => {
    let upstreamAborted = false
    let resolveUpstreamAbort!: () => void
    const upstreamAbort = new Promise<void>((resolve) => {
      resolveUpstreamAbort = resolve
    })

    mockCreateImpl = async (_body: any, options: any) => {
      const signal = options?.signal
      signal?.addEventListener('abort', () => {
        upstreamAborted = true
        resolveUpstreamAbort()
      })
      return (async function* () {
        yield { choices: [{ delta: { content: 'Chunk 1' } }] }
        await new Promise((_, reject) => {
          if (signal?.aborted) return reject(new Error('Aborted'))
          signal?.addEventListener('abort', () => reject(new Error('Aborted')))
        })
      })()
    }

    const controller = new AbortController()
    const res = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Disconnect test' }],
      }),
      signal: controller.signal,
    })

    const reader = res.body?.getReader()
    await reader?.read()

    controller.abort()

    await upstreamAbort

    assert.equal(upstreamAborted, true, 'Upstream Groq stream should be aborted on client disconnect')
  })
})
