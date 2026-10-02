import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import {
  capForModel,
  extractTitle,
  fetchPageText,
  htmlToText,
  isNonPublicAddress,
  parsePublicUrl,
  UrlSummaryError,
} from './urlSummary'

describe('isNonPublicAddress', () => {
  const blocked = [
    '127.0.0.1',
    '127.1.2.3',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '198.18.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::a9fe:a9fe',
    '2001:db8::1',
    'not-an-ip',
  ]
  const allowed = [
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.32.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ]

  for (const ip of blocked) it(`blocks ${ip}`, () => assert.equal(isNonPublicAddress(ip), true))
  for (const ip of allowed) it(`allows ${ip}`, () => assert.equal(isNonPublicAddress(ip), false))
})

describe('parsePublicUrl', () => {
  const rejects = (raw: unknown, code: string) => {
    assert.throws(
      () => parsePublicUrl(raw),
      (err: unknown) => err instanceof UrlSummaryError && err.code === code,
    )
  }

  it('accepts public http(s) URLs', () => {
    assert.equal(parsePublicUrl('https://example.com/a?b=1').hostname, 'example.com')
    assert.equal(parsePublicUrl('http://example.com:80/').hostname, 'example.com')
  })
  it('rejects missing or malformed input', () => {
    rejects(undefined, 'URL_REQUIRED')
    rejects('   ', 'URL_REQUIRED')
    rejects('not a url', 'URL_INVALID')
    rejects(`https://example.com/${'a'.repeat(2100)}`, 'URL_TOO_LONG')
  })
  it('rejects other schemes', () => {
    rejects('file:///etc/passwd', 'URL_SCHEME_NOT_ALLOWED')
    rejects('ftp://example.com/', 'URL_SCHEME_NOT_ALLOWED')
    rejects('gopher://example.com/', 'URL_SCHEME_NOT_ALLOWED')
  })
  it('rejects credentials and non-web ports', () => {
    rejects('https://user:pass@example.com/', 'URL_CREDENTIALS_NOT_ALLOWED')
    rejects('http://example.com:6379/', 'URL_PORT_NOT_ALLOWED')
    rejects('http://example.com:8080/', 'URL_PORT_NOT_ALLOWED')
  })
  it('rejects internal hosts and literal private IPs', () => {
    for (const raw of [
      'http://localhost/',
      'http://api.localhost/',
      'http://printer.local/',
      'http://db.internal/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.1.2.3/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://0x7f000001/',
      'http://2130706433/',
    ]) {
      rejects(raw, 'URL_ADDRESS_NOT_ALLOWED')
    }
  })
})

describe('htmlToText', () => {
  it('drops scripts, styles and markup and decodes entities', () => {
    const html = `<html><head><title>T</title><style>body{}</style></head>
      <body><nav>menu</nav><script>alert(1)</script><h1>Hello &amp; welcome</h1>
      <p>First&nbsp;para &#8212; ok</p><!-- hidden --><p>Second <b>bold</b></p></body></html>`
    assert.equal(htmlToText(html), 'Hello & welcome\n\nFirst para — ok\nSecond bold')
  })
  it('extracts the title', () => {
    assert.equal(extractTitle('<title> A &amp; B </title>'), 'A & B')
    assert.equal(extractTitle('<p>none</p>'), undefined)
  })
})

describe('capForModel', () => {
  it('leaves short text alone', () => {
    assert.deepEqual(capForModel('short', 100), { text: 'short', truncated: false })
  })
  it('caps long text at a word boundary', () => {
    const { text, truncated } = capForModel('word '.repeat(100), 52)
    assert.equal(truncated, true)
    assert.ok(text.length <= 54)
    assert.ok(text.endsWith(' …'))
  })
})

describe('fetchPageText', () => {
  let server: http.Server
  let port: number
  const routes: Record<string, (res: http.ServerResponse) => void> = {
    '/page': (res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        '<html><head><title>Public page</title></head><body><p>Stellar is a network.</p></body></html>',
      )
    },
    '/big': (res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('x '.repeat(50_000))
    },
    '/binary': (res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      res.end(Buffer.alloc(10))
    },
    '/to-internal': (res) => {
      res.writeHead(302, { Location: `http://metadata.test:${port}/page` })
      res.end()
    },
    '/to-loopback-literal': (res) => {
      res.writeHead(302, { Location: `http://127.0.0.1:${port}/page` })
      res.end()
    },
    '/loop': (res) => {
      res.writeHead(302, { Location: '/loop' })
      res.end()
    },
  }

  before(async () => {
    server = http.createServer((req, res) =>
      (
        routes[req.url ?? ''] ??
        ((r) => {
          r.writeHead(404)
          r.end()
        })
      )(res),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  after(() => new Promise<void>((resolve) => server.close(() => resolve())))

  // The test server runs on loopback. `public.test` stands in for a public
  // host (mapped to the test server, and allowed); `metadata.test` resolves
  // to the cloud metadata IP and must stay blocked.
  const fakeDns: any = (hostname: string, _opts: unknown, cb: any) => {
    if (hostname === 'public.test') return cb(null, [{ address: '127.0.0.1', family: 4 }])
    if (hostname === 'metadata.test') return cb(null, [{ address: '169.254.169.254', family: 4 }])
    cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
  }
  const asPublic = () => ({
    lookup: fakeDns,
    allowedPorts: new Set([port]),
    // Only the test server's loopback address counts as "public" here.
    isAllowedAddress: (a: string) => a === '127.0.0.1',
  })

  it('fetches and extracts a public page', async () => {
    const page = await fetchPageText(`http://public.test:${port}/page`, asPublic())
    assert.equal(page.title, 'Public page')
    assert.equal(page.text, 'Stellar is a network.')
    assert.equal(page.truncated, false)
  })

  it('refuses a hostname that resolves to a private address (DNS rebinding)', async () => {
    await assert.rejects(
      fetchPageText(`http://public.test:${port}/page`, {
        lookup: fakeDns,
        allowedPorts: new Set([port]),
      }),
      (err: unknown) => err instanceof UrlSummaryError && err.code === 'URL_ADDRESS_NOT_ALLOWED',
    )
  })

  it('refuses redirects to internal hosts', async () => {
    await assert.rejects(
      fetchPageText(`http://public.test:${port}/to-internal`, asPublic()),
      (err: unknown) => err instanceof UrlSummaryError && err.code === 'URL_ADDRESS_NOT_ALLOWED',
    )
    await assert.rejects(
      fetchPageText(`http://public.test:${port}/to-loopback-literal`, asPublic()),
      (err: unknown) => err instanceof UrlSummaryError && err.code === 'URL_ADDRESS_NOT_ALLOWED',
    )
  })

  it('stops after too many redirects', async () => {
    await assert.rejects(
      fetchPageText(`http://public.test:${port}/loop`, asPublic()),
      (err: unknown) => err instanceof UrlSummaryError && err.code === 'URL_TOO_MANY_REDIRECTS',
    )
  })

  it('rejects non-text content', async () => {
    await assert.rejects(
      fetchPageText(`http://public.test:${port}/binary`, asPublic()),
      (err: unknown) => err instanceof UrlSummaryError && err.status === 415,
    )
  })

  it('caps the download size and marks the page truncated', async () => {
    const page = await fetchPageText(`http://public.test:${port}/big`, {
      ...asPublic(),
      maxBytes: 1_000,
    })
    assert.equal(page.truncated, true)
    assert.ok(page.text.length <= 1_000)
  })
})
