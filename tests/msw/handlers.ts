import { http, HttpResponse } from 'msw'

export const handlers = [
  http.post('https://google.serper.dev/search', async ({ request }) => {
    const body = (await request.clone().json()) as any
    return HttpResponse.json({
      searchParameters: { q: body.q || 'stellar', type: 'search', gl: 'us', hl: 'en', num: 10 },
      organic: [
        {
          title: 'Stellar - An open network for money',
          link: 'https://stellar.org/',
          snippet:
            'Stellar is an open network that allows money to move globally, swiftly, and reliably. Learn more about the Stellar network.',
          position: 1,
        },
      ],
    })
  }),

  http.post('https://google.serper.dev/images', async ({ request }) => {
    const body = (await request.clone().json()) as any
    return HttpResponse.json({
      searchParameters: { q: body.q || 'stellar', type: 'images' },
      images: [
        {
          title: 'Stellar Logo',
          imageUrl: 'https://example.com/stellar.png',
          imageWidth: 800,
          imageHeight: 600,
          thumbnailUrl: 'https://example.com/stellar-thumb.png',
          thumbnailWidth: 150,
          thumbnailHeight: 150,
          source: 'Stellar Foundation',
          domain: 'stellar.org',
          link: 'https://stellar.org',
        },
      ],
    })
  }),

  http.post('https://google.serper.dev/news', async ({ request }) => {
    const body = (await request.clone().json()) as any
    return HttpResponse.json({
      searchParameters: { q: body.q || 'stellar', type: 'news' },
      news: [
        {
          title: 'Stellar introduces new smart contracts',
          link: 'https://example.com/news/stellar-smart-contracts',
          snippet: 'Soroban brings smart contracts to the Stellar network...',
          date: '2 hours ago',
          source: 'Crypto News',
          imageUrl: 'https://example.com/news-image.jpg',
          position: 1,
        },
      ],
    })
  }),

  http.post('https://api.groq.com/openai/v1/chat/completions', async ({ request }) => {
    const body = (await request.clone().json()) as any

    if (body.stream) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          const chunk = {
            id: 'chatcmpl-mock',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: body.model || 'llama3-8b-8192',
            choices: [
              {
                delta: { content: 'Mock response from Groq stream' },
                index: 0,
                finish_reason: null,
              },
            ],
          }
          const endChunk = {
            id: 'chatcmpl-mock',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: body.model || 'llama3-8b-8192',
            choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(endChunk)}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new HttpResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    return HttpResponse.json({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model || 'llama3-8b-8192',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Mock response from Groq' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    })
  }),
]
