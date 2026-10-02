/**
 * summarize_url support: fetch a public web page safely and reduce it to
 * plain text for the model.
 *
 * This is an SSRF surface, so every outbound connection is checked:
 *   - only http/https, only ports 80 and 443, no credentials in the URL
 *   - the hostname is resolved and EVERY address is checked against private,
 *     loopback, link-local, CGNAT, multicast and other non-public ranges
 *   - the check runs inside the socket's DNS lookup, i.e. on the address we
 *     actually connect to, so DNS rebinding can't swap in an internal IP
 *     between "validate" and "connect"
 *   - redirects are followed manually (max 3) and each hop goes through the
 *     same checks
 *   - responses are capped in time and size, and only text/html or text/plain
 *     is accepted
 */

import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

export const MAX_FETCH_BYTES = 1_000_000 // 1 MB of response body
export const MAX_MODEL_CHARS = 12_000 // text sent to the model
export const FETCH_TIMEOUT_MS = 10_000
export const MAX_REDIRECTS = 3
const ALLOWED_PORTS = new Set([80, 443])

export class UrlSummaryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'UrlSummaryError'
  }
}

// ─── Address classification ──────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
}

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]

/** Expand an IPv6 address to 8 groups of 16 bits. Returns null if invalid. */
function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase()
  const zone = addr.indexOf('%')
  if (zone !== -1) addr = addr.slice(0, zone)

  // Trailing embedded IPv4 (e.g. ::ffff:127.0.0.1)
  const lastColon = addr.lastIndexOf(':')
  const tail = addr.slice(lastColon + 1)
  if (tail.includes('.')) {
    if (!net.isIPv4(tail)) return null
    const n = ipv4ToInt(tail)
    addr = `${addr.slice(0, lastColon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }

  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest]
  const parsed = groups.map((g) => parseInt(g, 16))
  return parsed.length === 8 && parsed.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? parsed
    : null
}

/**
 * True when `ip` is not a publicly routable unicast address. Anything that
 * can't be parsed counts as non-public.
 */
export function isNonPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits))
  }
  if (!net.isIPv6(ip)) return true

  const g = expandIPv6(ip)
  if (!g) return true

  // :: (unspecified) and ::1 (loopback)
  if (g.slice(0, 7).every((x) => x === 0) && (g[7] === 0 || g[7] === 1)) return true
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): check the IPv4 part
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`
    return isNonPublicAddress(v4)
  }
  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isNonPublicAddress(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`)
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // 2001:db8::/32 documentation
  if (g[0] === 0x2002) return true // 6to4 can embed private IPv4
  if (g[0] === 0x2001 && g[1] === 0) return true // Teredo
  return false
}

// ─── URL validation ──────────────────────────────────────────────────────

/** Parse and check the parts of a URL that don't need DNS. */
export function parsePublicUrl(
  raw: unknown,
  allowedPorts: ReadonlySet<number> = ALLOWED_PORTS,
): URL {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new UrlSummaryError('Missing required parameter: url', 400, 'URL_REQUIRED')
  }
  if (raw.length > 2048) {
    throw new UrlSummaryError('URL too long. Maximum 2048 characters.', 400, 'URL_TOO_LONG')
  }

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new UrlSummaryError('Invalid URL', 400, 'URL_INVALID')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlSummaryError('Only http and https URLs are allowed', 400, 'URL_SCHEME_NOT_ALLOWED')
  }
  if (url.username || url.password) {
    throw new UrlSummaryError(
      'URLs with credentials are not allowed',
      400,
      'URL_CREDENTIALS_NOT_ALLOWED',
    )
  }
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!allowedPorts.has(port)) {
    throw new UrlSummaryError('Only ports 80 and 443 are allowed', 400, 'URL_PORT_NOT_ALLOWED')
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host) {
    throw new UrlSummaryError('URL has no host', 400, 'URL_INVALID')
  }
  // Literal IPs can be rejected before any network activity.
  if (net.isIP(host) && isNonPublicAddress(host)) {
    throw new UrlSummaryError(
      'Refusing to fetch a private or internal address',
      403,
      'URL_ADDRESS_NOT_ALLOWED',
    )
  }
  const lower = host.toLowerCase()
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    throw new UrlSummaryError(
      'Refusing to fetch a private or internal address',
      403,
      'URL_ADDRESS_NOT_ALLOWED',
    )
  }
  return url
}

type LookupFn = typeof dns.lookup

/**
 * A dns.lookup replacement for http(s).request: resolves as usual, then
 * refuses the connection if any resolved address is non-public.
 */
export function createGuardedLookup(
  isAllowed: (address: string) => boolean = (a) => !isNonPublicAddress(a),
  baseLookup: LookupFn = dns.lookup,
): LookupFn {
  const guarded = (hostname: string, options: any, callback: any) => {
    if (typeof options === 'function') {
      callback = options
      options = {}
    }
    baseLookup(hostname, { ...options, all: true }, (err: any, addresses: any) => {
      if (err) return callback(err)
      const list: dns.LookupAddress[] = Array.isArray(addresses)
        ? addresses
        : [{ address: addresses, family: 4 }]
      if (list.length === 0) {
        return callback(new UrlSummaryError('Host did not resolve', 502, 'URL_DNS_FAILED'))
      }
      if (list.some((a) => !isAllowed(a.address))) {
        return callback(
          new UrlSummaryError(
            'Refusing to fetch a private or internal address',
            403,
            'URL_ADDRESS_NOT_ALLOWED',
          ),
        )
      }
      if (options?.all) return callback(null, list)
      callback(null, list[0].address, list[0].family)
    })
  }
  return guarded as unknown as LookupFn
}

// ─── Fetching ─────────────────────────────────────────────────────────────

export interface FetchedPage {
  finalUrl: string
  contentType: string
  body: string
  truncated: boolean
}

export interface FetchOptions {
  /** Test hook: which resolved addresses may be connected to. */
  isAllowedAddress?: (address: string) => boolean
  /** Test hook: DNS resolver used before the address check. */
  lookup?: LookupFn
  /** Test hook: ports that may be fetched (default 80 and 443). */
  allowedPorts?: ReadonlySet<number>
  timeoutMs?: number
  maxBytes?: number
}

function requestOnce(url: URL, opts: Required<FetchOptions>): Promise<http.IncomingMessage> {
  const lib = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: 'GET',
        // No connection pooling: every request opens a fresh socket, so the
        // guarded lookup below always runs on the address we connect to.
        agent: false,
        lookup: createGuardedLookup(opts.isAllowedAddress, opts.lookup),
        timeout: opts.timeoutMs,
        headers: {
          'User-Agent': 'StellarSearch-summarize_url/1.0',
          Accept: 'text/html,text/plain;q=0.9',
        },
      },
      resolve,
    )
    req.on('timeout', () =>
      req.destroy(new UrlSummaryError('Timed out fetching URL', 504, 'URL_TIMEOUT')),
    )
    req.on('error', reject)
    req.end()
  })
}

function readCapped(
  res: http.IncomingMessage,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const finish = (truncated: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ body: Buffer.concat(chunks), truncated })
    }
    const timer = setTimeout(() => {
      res.destroy()
      if (!done) {
        done = true
        reject(new UrlSummaryError('Timed out reading URL', 504, 'URL_TIMEOUT'))
      }
    }, timeoutMs)

    res.on('data', (chunk: Buffer) => {
      if (done) return
      const room = maxBytes - size
      if (chunk.length >= room) {
        chunks.push(chunk.subarray(0, room))
        size = maxBytes
        res.destroy()
        finish(true)
        return
      }
      chunks.push(chunk)
      size += chunk.length
    })
    res.on('end', () => finish(false))
    res.on('error', (err) => {
      if (!done) {
        done = true
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

/** Fetch a public http(s) page, following up to MAX_REDIRECTS redirects. */
export async function fetchPublicPage(
  rawUrl: unknown,
  options: FetchOptions = {},
): Promise<FetchedPage> {
  const opts: Required<FetchOptions> = {
    isAllowedAddress: options.isAllowedAddress ?? ((a) => !isNonPublicAddress(a)),
    lookup: options.lookup ?? dns.lookup,
    allowedPorts: options.allowedPorts ?? ALLOWED_PORTS,
    timeoutMs: options.timeoutMs ?? FETCH_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? MAX_FETCH_BYTES,
  }

  let url = parsePublicUrl(rawUrl, opts.allowedPorts)
  for (let hop = 0; ; hop++) {
    const res = await requestOnce(url, opts)
    const status = res.statusCode ?? 0

    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume()
      if (hop >= MAX_REDIRECTS) {
        throw new UrlSummaryError('Too many redirects', 502, 'URL_TOO_MANY_REDIRECTS')
      }
      // Every hop gets the same URL checks, and its connection the same lookup guard.
      url = parsePublicUrl(new URL(res.headers.location, url).toString(), opts.allowedPorts)
      continue
    }

    if (status < 200 || status >= 300) {
      res.resume()
      throw new UrlSummaryError(`URL returned HTTP ${status}`, 502, 'URL_UPSTREAM_ERROR')
    }

    const contentType = String(res.headers['content-type'] || '').toLowerCase()
    if (
      !contentType.startsWith('text/html') &&
      !contentType.startsWith('text/plain') &&
      !contentType.startsWith('application/xhtml+xml')
    ) {
      res.resume()
      throw new UrlSummaryError(
        `Unsupported content type: ${contentType || 'unknown'}`,
        415,
        'URL_UNSUPPORTED_CONTENT',
      )
    }

    const { body, truncated } = await readCapped(res, opts.maxBytes, opts.timeoutMs)
    return { finalUrl: url.toString(), contentType, body: body.toString('utf8'), truncated }
  }
}

// ─── HTML → text ─────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** Extract the <title>, if any. */
export function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : ''
  return title || undefined
}

/** Reduce HTML to readable plain text. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(
        /<(script|style|noscript|svg|template|iframe|head|nav|footer)\b[\s\S]*?<\/\1\s*>/gi,
        ' ',
      )
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|pre)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Cap text for the model, cutting at a word boundary where possible. */
export function capForModel(
  text: string,
  maxChars = MAX_MODEL_CHARS,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  const cut = text.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return {
    text: (lastSpace > maxChars * 0.8 ? cut.slice(0, lastSpace) : cut) + ' …',
    truncated: true,
  }
}

export interface PageText {
  finalUrl: string
  title?: string
  text: string
  truncated: boolean
}

/** Fetch a public page and return model-ready plain text. */
export async function fetchPageText(
  rawUrl: unknown,
  options: FetchOptions = {},
): Promise<PageText> {
  const page = await fetchPublicPage(rawUrl, options)
  const isHtml = !page.contentType.startsWith('text/plain')
  const plain = isHtml ? htmlToText(page.body) : page.body.trim()
  if (!plain) {
    throw new UrlSummaryError('The page has no readable text', 422, 'URL_NO_TEXT')
  }
  const capped = capForModel(plain)
  return {
    finalUrl: page.finalUrl,
    title: isHtml ? extractTitle(page.body) : undefined,
    text: capped.text,
    truncated: page.truncated || capped.truncated,
  }
}
