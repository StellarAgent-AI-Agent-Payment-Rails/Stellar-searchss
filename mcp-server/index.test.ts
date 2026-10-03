import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// Set NODE_ENV to test to prevent StdioServerTransport from connecting during import
process.env.NODE_ENV = 'test'
process.env.SEARCH_API_URL = 'http://localhost:3001'
process.env.GROQ_API_KEY = 'test-groq-key'

const { listToolsHandler, callToolHandler, server, tools, formatPaymentLine } = await import('./index.js')
import { 
  AMOUNT_USDC, 
  HORIZON_URL, 
  STELLAR_NETWORK, 
  STELLAR_EXPERT_URL, 
  USDC_ISSUER 
} from '../src/lib/constants.js'

describe('MCP Server - ListTools', () => {
  it('returns all expected tools with proper schemas', async () => {
    const res = await listToolsHandler()
    assert.ok(res && Array.isArray(res.tools), 'tools should be an array')

    const toolNames = res.tools.map((t) => t.name)
    assert.deepStrictEqual(
      toolNames.sort(),
      ['ai_summarize', 'check_balance', 'get_search_stats', 'image_search', 'list_receipts', 'news_search', 'summarize_url', 'web_search'].sort()
    )

    for (const tool of res.tools) {
      assert.ok(tool.name, 'tool should have a name')
      assert.ok(tool.description, `tool ${tool.name} should have a description`)
      assert.ok(tool.inputSchema, `tool ${tool.name} should have an inputSchema`)
      assert.strictEqual(tool.inputSchema.type, 'object')
    }

    const webSearchTool = res.tools.find((t) => t.name === 'web_search')
    assert.deepStrictEqual(webSearchTool?.inputSchema.required, ['query'])

    const imageSearchTool = res.tools.find((t) => t.name === 'image_search')
    assert.deepStrictEqual(imageSearchTool?.inputSchema.required, ['query'])

    const newsSearchTool = res.tools.find((t) => t.name === 'news_search')
    assert.deepStrictEqual(newsSearchTool?.inputSchema.required, ['query'])

    const summarizeTool = res.tools.find((t) => t.name === 'ai_summarize')
    assert.deepStrictEqual(summarizeTool?.inputSchema.required, ['text'])

    const balanceTool = res.tools.find((t) => t.name === 'check_balance')
    assert.deepStrictEqual(balanceTool?.inputSchema.required, ['address'])
  })
})

describe('MCP Server - CallTool Handlers', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('web_search', () => {
    it('executes search with query, count, and freshness, and formats output correctly', async () => {
      let requestedUrl = ''

      globalThis.fetch = (async (url: string | URL | Request) => {
        requestedUrl = url.toString()
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Stellar Documentation',
                url: 'https://developers.stellar.org',
                description: 'Official docs for building on Stellar',
              },
              {
                title: 'Stellar Community',
                url: 'https://stellar.org/community',
                description: 'Join the Stellar developer ecosystem',
              },
            ],
            paidAmount: '0.001',
            txHash: 'deadbeef',
            currency: 'USDC',
            network: 'stellar:testnet',
            latencyMs: 120,
            count: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'web_search',
          arguments: { query: 'stellar docs', count: 2, freshness: 'pw' },
        },
      })

      assert.strictEqual(res.isError, undefined)
      assert.strictEqual(res.content.length, 1)
      assert.strictEqual(res.content[0].type, 'text')

      const text = res.content[0].text
      assert.ok(requestedUrl.includes('/search?'))
      assert.ok(requestedUrl.includes('q=stellar+docs'))
      assert.ok(requestedUrl.includes('count=2'))
      assert.ok(requestedUrl.includes('freshness=pw'))

      assert.ok(text.includes('🔍 Results for: "stellar docs"'))
      assert.ok(text.includes('💰 Paid: 0.001 USDC on stellar:testnet'))
      assert.ok(text.includes('⚡ Latency: 120ms'))
      assert.ok(text.includes('📊 2 results'))
      assert.ok(text.includes('1. **Stellar Documentation**\n   https://developers.stellar.org\n   Official docs for building on Stellar'))
      assert.ok(text.includes('2. **Stellar Community**\n   https://stellar.org/community\n   Join the Stellar developer ecosystem'))
    })

    it('handles search server error response gracefully', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({ error: 'Payment required: insufficient funds' }),
          { status: 402, headers: { 'Content-Type': 'application/json' } }
        )
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'web_search',
          arguments: { query: 'fail test' },
        },
      })

      assert.strictEqual(res.isError, true)
      assert.ok(res.content[0].text.includes('Search failed: Payment required: insufficient funds'))
    })
  })

  describe('image_search', () => {
    it('executes image search and clamps count between 1 and 10', async () => {
      let requestedUrl = ''

      globalThis.fetch = (async (url: string | URL | Request) => {
        requestedUrl = url.toString()
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Stellar Logo',
                imageUrl: 'https://example.com/logo.png',
                sourceUrl: 'https://example.com',
                source: 'example.com',
              },
            ],
            paidAmount: '0.001',
            currency: 'USDC',
            network: 'stellar:testnet',
            latencyMs: 95,
            count: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'image_search',
          arguments: { query: 'stellar logo', count: 50 }, // should clamp to 10
        },
      })

      assert.strictEqual(res.isError, undefined)
      assert.ok(requestedUrl.includes('count=10'))
      const text = res.content[0].text
      assert.ok(text.includes('🖼️  Image results for: "stellar logo"'))
      assert.ok(text.includes('Image: https://example.com/logo.png'))
      assert.ok(text.includes('Source: https://example.com (example.com)'))
    })

    it('handles image search failure', async () => {
      globalThis.fetch = (async () => {
        return new Response('Internal error', { status: 500 })
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'image_search',
          arguments: { query: 'fail' },
        },
      })

      assert.strictEqual(res.isError, true)
      assert.ok(res.content[0].text.includes('Image search failed: HTTP 500'))
    })
  })

  describe('news_search', () => {
    it('executes news search and formats published date properly', async () => {
      let requestedUrl = ''

      globalThis.fetch = (async (url: string | URL | Request) => {
        requestedUrl = url.toString()
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Stellar Announces Upgrade',
                source: 'CoinDesk',
                publishedAt: '2 hours ago',
                url: 'https://coindesk.com/article',
                snippet: 'Stellar network protocol update is live.',
              },
              {
                title: 'Crypto Market Summary',
                source: 'Bloomberg',
                url: 'https://bloomberg.com/crypto',
                snippet: 'Markets move as volume rises.',
              },
            ],
            paidAmount: '0.001',
            currency: 'USDC',
            network: 'stellar:testnet',
            latencyMs: 110,
            count: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'news_search',
          arguments: { query: 'stellar', count: 2, freshness: 'pd' },
        },
      })

      assert.strictEqual(res.isError, undefined)
      assert.ok(requestedUrl.includes('count=2'))
      assert.ok(requestedUrl.includes('freshness=pd'))

      const text = res.content[0].text
      assert.ok(text.includes('📰 News results for: "stellar"'))
      assert.ok(text.includes('1. **Stellar Announces Upgrade** (CoinDesk · 2 hours ago)'))
      assert.ok(text.includes('2. **Crypto Market Summary** (Bloomberg)'))
    })

    it('handles news search failure', async () => {
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ error: 'News service unavailable' }), { status: 503 })
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'news_search',
          arguments: { query: 'test' },
        },
      })

      assert.strictEqual(res.isError, true)
      assert.ok(res.content[0].text.includes('News search failed: News service unavailable'))
    })
  })

  describe('ai_summarize', () => {
    it('summarises text using Groq via mocked fetch', async () => {
      let interceptedBody: any = null

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) {
          interceptedBody = JSON.parse(init.body as string)
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: 'Stellar is an open-source decentralized payment rail.',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'ai_summarize',
          arguments: { text: 'Some long article text here', instruction: 'condense' },
        },
      })

      assert.strictEqual(res.isError, undefined)
      assert.strictEqual(res.content[0].text, 'Stellar is an open-source decentralized payment rail.')
      assert.ok(interceptedBody)
      assert.ok(interceptedBody.messages.some((m: any) => m.content.includes('condense')))
    })

    it('handles Groq API error response', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error',
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        )
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'ai_summarize',
          arguments: { text: 'Hello' },
        },
      })

      assert.strictEqual(res.isError, true)
      assert.ok(res.content[0].text.includes('Groq error:'))
    })
  })

  describe('check_balance', () => {
    const testAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

    it('fetches and formats XLM and USDC balances from Horizon', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({
            balances: [
              {
                asset_type: 'native',
                balance: '45.1234567',
              },
              {
                asset_type: 'credit_alphanum4',
                asset_code: 'USDC',
                asset_issuer: USDC_ISSUER,
                balance: '10.5000000',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'check_balance',
          arguments: { address: testAddress },
        },
      })

      assert.strictEqual(res.isError, undefined)
      const text = res.content[0].text

      assert.ok(text.includes(`💳 Stellar Account: ${testAddress}`))
      assert.ok(text.includes('USDC: 10.500000 (~10,500 searches remaining)'))
      assert.ok(text.includes('XLM:  45.1235'))
      assert.ok(text.includes(`Explorer: ${STELLAR_EXPERT_URL}/account/${testAddress}`))
    })

    it('returns error when account is not found on Horizon (404)', async () => {
      globalThis.fetch = (async () => {
        return new Response('Not found', { status: 404 })
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'check_balance',
          arguments: { address: 'GNOTFOUND' },
        },
      })

      assert.strictEqual(res.isError, true)
      assert.ok(res.content[0].text.includes('Account not found on Stellar testnet'))
    })

    it('returns error when Horizon returns other status codes', async () => {
      globalThis.fetch = (async () => {
        return new Response('Server error', { status: 500 })
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'check_balance',
          arguments: { address: testAddress },
        },
      })

      assert.strictEqual(res.isError, true)
      assert.ok(res.content[0].text.includes('Horizon returned 500'))
    })
  })

  describe('get_search_stats', () => {
    it('fetches and formats server statistics', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({
            status: 'ok',
            network: 'stellar:testnet',
            uptime: '2d 4h 15m',
            totalQueries: 1420,
            totalUsdcSettled: 1.42,
            avgLatencyMs: 310,
            pricePerQuery: '0.001 USDC',
            facilitator: 'https://www.x402.org/facilitator',
            serperApiConfigured: true,
            groqApiConfigured: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'get_search_stats',
          arguments: {},
        },
      })

      assert.strictEqual(res.isError, undefined)
      const text = res.content[0].text
      assert.ok(text.includes('📊 StellarSearch Server Stats'))
      assert.ok(text.includes('Status:           OK'))
      assert.ok(text.includes('Network:          stellar:testnet'))
      assert.ok(text.includes('Uptime:           2d 4h 15m'))
      assert.ok(text.includes('Total Queries:    1,420'))
      assert.ok(text.includes('USDC Settled:     1.42 USDC'))
      assert.ok(text.includes('Avg Latency:      310ms'))
      assert.ok(text.includes('APIs Configured:  Serper: ✅, Groq: ✅'))
    })

    it('handles server health check error', async () => {
      globalThis.fetch = (async () => {
        return new Response('Gateway error', { status: 502 })
      }) as typeof globalThis.fetch

      const res = await callToolHandler({
        params: {
          name: 'get_search_stats',
          arguments: {},
        },
      })

      assert.strictEqual(res.isError, true)
      assert.ok(res.content[0].text.includes('Failed to fetch server stats: Server health check returned 502'))
    })
  })

  describe('unknown tool handling', () => {
    it('returns isError: true and unknown tool message for non-existent tools', async () => {
      const res = await callToolHandler({
        params: {
          name: 'non_existent_tool',
          arguments: {},
        },
      })

      assert.strictEqual(res.isError, true)
      assert.strictEqual(res.content.length, 1)
      assert.strictEqual(res.content[0].type, 'text')
      assert.strictEqual(res.content[0].text, 'Unknown tool: non_existent_tool')
    })
  })
})


const PAID_TOOL_NAMES = ['web_search', 'image_search', 'news_search'] as const

function paidToolDescription(name: string): string {
  const tool = tools.find((entry: { name: string }) => entry.name === name)
  assert.ok(tool, `expected a tool named ${name}`)
  return tool.description ?? ''
}

describe('paid MCP tool descriptions', () => {
  it('does not claim the tools pay automatically', () => {
    for (const name of PAID_TOOL_NAMES) {
      const description = paidToolDescription(name)
      assert.doesNotMatch(description, /automatically pays/i)
      assert.doesNotMatch(description, /server handles the full payment flow/i)
    }
  })

  it('states that the MCP server does not configure a payment signer', () => {
    for (const name of PAID_TOOL_NAMES) {
      assert.match(paidToolDescription(name), /does not configure a payment signer/i)
    }
  })
})

describe('formatPaymentLine', () => {
  it('does not claim a payment when there is no settlement transaction', () => {
    const line = formatPaymentLine({
      paidAmount: '0.001', currency: 'USDC', network: 'stellar:testnet', txHash: null,
    })
    assert.doesNotMatch(line, /\bpaid\b/i)
    assert.match(line, /not confirmed/i)
  })

  it('reports payment only when a settlement transaction is present', () => {
    const line = formatPaymentLine({
      paidAmount: '0.001', currency: 'USDC', network: 'stellar:testnet', txHash: 'deadbeef',
    })
    assert.match(line, /Paid: 0\.001 USDC on stellar:testnet/)
  })
})
