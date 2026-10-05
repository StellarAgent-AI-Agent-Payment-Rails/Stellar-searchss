#!/usr/bin/env tsx
/**
 * test-search.ts — End-to-end test of the x402 payment flow
 *
 * Usage:
 *   npm run test:search "Stellar blockchain"
 *   npm run test:search "AI agents" -- --count 10 --verbose
 *   npm run test:search -- --count 5 --json
 *   npm run test:search -- --help
 *   npm run test:search -- --paid --verbose   (SPENDS TESTNET USDC)
 *
 * Modes:
 *   - Default (unpaid, FREE): verifies request validation + health +
 *     that /search enforces payment (expects HTTP 402 with payment
 *     requirements). Settles nothing, spends nothing.
 *   - Paid (--paid, SPENDS TESTNET USDC ~0.001 USDC/search, up to ~0.003
 *     USDC per run): performs the full x402 flow with a server-side signer
 *     (STELLAR_PAYER_SECRET), asserting 200 status, paid response shape,
 *     and presence of a tx hash.
 *
 * Requirements:
 *   - Server must be running:  npm run server
 *   - .env must have STELLAR_RECEIVING_ADDRESS, SERPER_API_KEY, GROQ_API_KEY set
 *   - Paid mode additionally requires STELLAR_PAYER_SECRET (testnet account
 *     funded with XLM + USDC trustline + USDC balance)
 *
 * Exit codes:
 *   - 0: all assertions passed
 *   - 1: any assertion failed (or setup error)
 *
 * Human-readable output (per-result listing, AI demo text) is only printed
 * with --verbose. Default output is a compact assertion checklist so CI logs
 * stay clean.
 */

import dotenv from 'dotenv'
import { Buffer } from 'node:buffer'
// Type-only import: erased at runtime (paid path uses dynamic import so a
// broken install fails loudly at runtime instead of silently changing shape).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type * as StellarSdk from '@stellar/stellar-sdk'
dotenv.config()

// ─── CLI args ─────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2)
const hasFlag = (...names: string[]): boolean => names.some((n) => rawArgs.includes(n))

if (hasFlag('--help', '-h')) {
  console.log(`
StellarSearch end-to-end x402 test
  Usage:
    npm run test:search [query] [-- --count N] [--paid] [--verbose] [--json]

  Flags:
    --count N    results per search request (default 5, 1-20)
    --paid       run the full paid flow (SPENDS TESTNET USDC, ~0.001 USDC/search).
                 Requires STELLAR_PAYER_SECRET in .env. Without it, the script
                 verifies the server enforces payment (expects HTTP 402) and
                 spends nothing.
    --verbose    print human-readable results (titles, snippets, AI demo)
    --json       print a machine-readable JSON summary at the end
    --help, -h   show this help

  Cost:
    Default mode is FREE (no payment is made; the 402 is never settled).
    --paid mode SPENDS TESTNET USDC on every paid search request.
`)
  process.exit(0)
}

function firstPositional(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--count') { i++; continue }
    if (a.startsWith('--')) continue
    if (i > 0 && args[i - 1] === '--count') continue
    return a
  }
  return undefined
}

const query: string = firstPositional(rawArgs) || 'Stellar blockchain developer tools'
const countIdx: number = rawArgs.indexOf('--count')
const count: number = countIdx !== -1 ? Number(rawArgs[countIdx + 1]) : 5
const VERBOSE: boolean = hasFlag('--verbose')
const JSON_OUT: boolean = hasFlag('--json')
const PAID: boolean = hasFlag('--paid')
const SERVER: string = process.env.SEARCH_API_URL || 'http://localhost:3001'

// Each paid search settles ~0.001 USDC; a paid run makes up to 3 paid calls
// (search + suggestions + no-suggestions probe).
const ESTIMATED_PAID_COST_USDC = 'up to ~0.003 USDC (testnet) + Stellar fees'

if (!Number.isFinite(count) || count < 1 || count > 20) {
  console.error(`Invalid --count value: ${countIdx !== -1 ? rawArgs[countIdx + 1] : '(missing)'} (expected 1-20)`)
  process.exit(1)
}

// ─── Assertion harness ────────────────────────────────────────────────────
interface Check { name: string; ok: boolean; detail?: string }
const checks: Check[] = []

function check(name: string, cond: unknown, detail?: string): boolean {
  const ok = Boolean(cond)
  checks.push({ name, ok, detail })
  console.log(`   ${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` -- ${detail}`}`)
  return ok
}

function printSummary(): void {
  const passed = checks.filter((c) => c.ok).length
  if (JSON_OUT) {
    console.log(JSON.stringify({
      query, count, server: SERVER, mode: PAID ? 'paid' : 'unpaid-402',
      passed, failed: checks.length - passed, checks,
    }, null, 2))
  } else {
    console.log(`\n-- Summary: ${passed}/${checks.length} checks passed --`)
  }
}

function fail(msg: string, detail?: string): never {
  if (detail) console.error(`FAIL ${msg} -- ${detail}`)
  else console.error(`FAIL ${msg}`)
  printSummary()
  process.exit(1)
}

function assertShape(value: unknown, path: string, predicate: (v: any) => boolean, expected: string): void {
  if (!predicate(value)) fail(`Unexpected response shape at ${path}`, `expected ${expected}`)
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ res: Response; body: any }> {
  const res = await fetch(url, init)
  const text = await res.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = { _raw: text.slice(0, 500) } }
  return { res, body }
}

async function checkHealth(): Promise<any> {
  const { res, body } = await fetchJson(`${SERVER}/health`)
  check('health endpoint returns 200', res.status === 200, `got ${res.status}`)
  if (res.status !== 200) fail('Health check failed', `status ${res.status}`)
  check('health status is ok', body?.status === 'ok', JSON.stringify(body)?.slice(0, 200))
  if (VERBOSE) {
    console.log('   Server status:', body.status)
    console.log('   Serper API:   ', body.serperApiConfigured ? 'ok' : 'MISSING')
    console.log('   Groq API:     ', body.groqApiConfigured ? 'ok' : 'MISSING')
    console.log('   Receiving addr:', body.receivingAddressConfigured ? 'ok' : 'MISSING')
    console.log('   Total queries: ', body.totalQueries)
  }
  check('Serper API configured', body?.serperApiConfigured === true, 'set SERPER_API_KEY')
  check('Groq API configured', body?.groqApiConfigured === true, 'set GROQ_API_KEY')
  check('Receiving address configured', body?.receivingAddressConfigured === true, 'set STELLAR_RECEIVING_ADDRESS')
  return body
}

// ─── Paid response shape assertions ─────────────────────────────────────────
function assertPaidShape(body: any, expectedQuery: string): void {
  assertShape(body, 'body', (v: any) => v != null && typeof v === 'object', 'JSON object')
  check('response echoes query', body?.query === expectedQuery, `got ${JSON.stringify(body?.query)}`)
  assertShape(body?.results, 'results', Array.isArray, 'array')
  check('response has at least one result', Array.isArray(body?.results) && body.results.length > 0,
    `got ${Array.isArray(body?.results) ? body.results.length : typeof body?.results} results`)
  check('count matches results length', body?.count === body?.results?.length,
    `count=${JSON.stringify(body?.count)} results=${body?.results?.length}`)
  assertShape(body?.results?.[0], 'results[0]', (v: any) => v != null && typeof v === 'object', 'object')
  check('results[0] has title', typeof body?.results?.[0]?.title === 'string' && body.results[0].title.length > 0)
  check('results[0] has url', typeof body?.results?.[0]?.url === 'string' && body.results[0].url.length > 0)
  check('paidAmount is 0.001', body?.paidAmount === '0.001', `got ${JSON.stringify(body?.paidAmount)}`)
  check('currency is USDC', body?.currency === 'USDC', `got ${JSON.stringify(body?.currency)}`)
  check('network is stellar:testnet', body?.network === 'stellar:testnet', `got ${JSON.stringify(body?.network)}`)
  assertShape(body?.suggestions, 'suggestions', (v: any) => v === undefined || Array.isArray(v), 'array (may be omitted)')
}

function printResults(data: any, ms: number): void {
  console.log('\nResults received!')
  console.log(`   Query:    "${data.query}"`)
  console.log(`   Results:  ${data.count}`)
  console.log(`   Latency:  ${ms}ms`)
  console.log(`   Paid:     ${data.paidAmount} ${data.currency}`)
  console.log(`   Network:  ${data.network}`)
  if (data.txHash) console.log(`   TX Hash:  ${data.txHash}`)
  console.log('\n-- Results --')
  data.results.forEach((r: any, i: number) => {
    console.log(`\n${i + 1}. ${r.title}`)
    console.log(`   ${r.url}`)
    if (r.description) console.log(`   ${r.description.slice(0, 120)}${r.description.length > 120 ? '...' : ''}`)
  })
<<<<<<< HEAD
=======

  // 3. Test Groq AI
  console.log('\n── Groq AI test ──')
  const aiRes = await fetch(`${SERVER}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: `Summarise what I should know about: ${query}` }],
    }),
  })

  if (aiRes.ok) {
    const aiData = await aiRes.json()
    console.log(`\n✓ Groq AI (${aiData.model}):`)
    console.log(`   ${aiData.content.slice(0, 200)}...`)
  } else {
    console.log('✗ Groq AI unavailable (check GROQ_API_KEY)')
  }

  // 4. Test AI suggestions — via decoupled GET /suggestions?q=...
  console.log('\n── AI suggestions test ──')

  const t1 = Date.now()
  const suggRes = await fetch(`${SERVER}/suggestions?q=${encodeURIComponent(query)}`)
  const suggMs = Date.now() - t1

  if (!suggRes.ok) {
    console.error('✗ Suggestions request failed:', suggRes.status)
  } else {
    const suggData = await suggRes.json()
    const suggestions: string[] = suggData.suggestions ?? []

    if (!Array.isArray(suggestions)) {
      console.error('✗ suggestions field is not an array')
      process.exit(1)
    }

    console.log(`\n✓ Got ${suggestions.length} AI suggestions asynchronously (${suggMs}ms total):`)
    suggestions.forEach((s, i) => console.log(`   ${i + 1}. ${s}`))
  }

  console.log('\n✅ All tests passed!\n')
>>>>>>> 7bd005c (fix: implement code splitting and decouple Groq suggestions (closes #171, closes #179))
}

// ─── Paid x402 client (server-side signer, no browser/Freighter) ────────────
// Mirrors src/hooks/useSearch.ts but signs the Soroban auth entry with a
// Stellar secret key (STELLAR_PAYER_SECRET) instead of Freighter. Dynamic
// imports keep `tsc --noEmit` / `tsx` working even if the optional x402
// packages differ in version; any incompatibility fails loudly (non-zero).
async function buildPaidFetch(secret: string): Promise<{ client: any; httpClient: any }> {
  let x402Fetch: any = null
  let stellarClient: any = null
  let stellarSdk: any = null
  try {
    x402Fetch = await import('@x402/fetch')
    stellarClient = await import('@x402/stellar/exact/client')
    stellarSdk = await import('@stellar/stellar-sdk')
  } catch (err: any) {
    fail('Paid mode needs @x402/fetch, @x402/stellar and @stellar/stellar-sdk installed',
      err?.message ?? String(err))
  }

  const { x402Client, x402HTTPClient } = x402Fetch
  const { ExactStellarScheme } = stellarClient
  const { Keypair, Networks } = stellarSdk

  let keypair: any = null
  try {
    keypair = Keypair.fromSecret(secret.trim())
  } catch {
    fail('STELLAR_PAYER_SECRET is not a valid Stellar secret key (expected S...)')
  }

  const passphrase: string = Networks.TESTNET
  const sorobanRpcUrl: string = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'

  const signer = {
    address: keypair.publicKey(),
    signAuthEntry: async (xdr: string, opts?: { networkPassphrase?: string }): Promise<{ signedAuthEntry: string; signerAddress: string }> => {
      // Sign the 32-byte auth-entry hash with the payer's ed25519 key and
      // return base64 bytes -- the same encoding the Freighter path produces
      // (see src/hooks/useSearch.ts).
      const hash: Buffer = Buffer.from(xdr, 'base64')
      const signed: Uint8Array = keypair.sign(hash)
      void (opts?.networkPassphrase ?? passphrase)
      return {
        signedAuthEntry: Buffer.from(signed).toString('base64'),
        signerAddress: keypair.publicKey(),
      }
    },
  }

  const client = new x402Client().register(
    'stellar:*',
    new ExactStellarScheme(signer, { url: sorobanRpcUrl }),
  )
  const httpClient = new x402HTTPClient(client)
  return { client, httpClient }
}

async function paidHeaders(paid: { client: any; httpClient: any }, url: string): Promise<Record<string, string>> {
  const firstRes = await fetch(url)
  if (firstRes.status !== 402) {
    const text = (await firstRes.text()).slice(0, 300)
    fail('Expected HTTP 402 before paying', `got ${firstRes.status}: ${text}`)
  }
  const headerGetter = (name: string): string | null => firstRes.headers.get(name)
  let paymentRequired: any = null
  try {
    paymentRequired = paid.httpClient.getPaymentRequiredResponse(headerGetter)
  } catch (err: any) {
    fail('Failed to parse payment requirements', err?.message ?? String(err))
  }
  check('402 carries parseable payment requirements', paymentRequired != null)
  let payload: any = null
  try {
    payload = await paid.client.createPaymentPayload(paymentRequired)
  } catch (err: any) {
    fail('Failed to create payment payload (signing failed?)', err?.message ?? String(err))
  }
  try {
    return paid.httpClient.encodePaymentSignatureHeader(payload) as Record<string, string>
  } catch (err: any) {
    fail('Failed to encode payment header', err?.message ?? String(err))
  }
}

function finalize(): never {
  printSummary()
  const failed = checks.filter((c) => !c.ok)
  if (failed.length > 0 || checks.length === 0) {
    console.log(`\nFAILED: ${failed.length} check(s) failed.\n`)
    process.exit(1)
  }
  console.log('\nAll tests passed!\n')
  process.exit(0)
}

async function runSearch(): Promise<void> {
  console.log('\nStellarSearch End-to-End Test\n')
  console.log(`   Server:  ${SERVER}`)
  console.log(`   Query:   "${query}"`)
  console.log(`   Count:   ${count}`)
  console.log(`   Mode:    ${PAID ? 'PAID (full x402 flow)' : 'UNPAID (verify 402 enforcement)'}`)
  // Cost must be stated BEFORE anything that could spend money.
  if (PAID) {
    console.log(`   COST: this run SPENDS TESTNET USDC -- ${ESTIMATED_PAID_COST_USDC}.`)
    console.log(`        Testnet USDC has no monetary value, but the spend is real on-chain.`)
  } else {
    console.log(`   Cost:    FREE -- no payment is settled in this mode (pass --paid to spend testnet USDC).`)
  }
  console.log('')

  // ── 1. Validation: missing q must be 400 (no payment involved) ──
  console.log('-- Request validation --')
  {
    const { res, body } = await fetchJson(`${SERVER}/search`)
    check('GET /search without q returns 400', res.status === 400, `got ${res.status}`)
    if (res.status !== 400) fail('Validation check failed', `expected 400, got ${res.status}: ${JSON.stringify(body)?.slice(0, 200)}`)
    check('400 body has error field', typeof body?.error === 'string' && body.error.length > 0)
  }

  // ── 2. Health ──
  console.log('\n-- Health check --')
  try {
    await checkHealth()
  } catch (err: any) {
    console.error('Server not reachable:', err.message)
    console.error('\nStart the server first: npm run server')
    process.exit(1)
  }

  // ── 3. Search gate ──
  console.log('\n-- Search request --')
  console.log('GET /search (x402 middleware will enforce payment)')

  const t0 = Date.now()
  const params = new URLSearchParams({ q: query, count: String(count) })

  // ── Unpaid mode: assert the 402 gate ──────────────────────────────────────
  if (!PAID) {
    const { res, body } = await fetchJson(`${SERVER}/search?${params}`)
    const ms = Date.now() - t0
    check('unpaid GET /search returns 402', res.status === 402, `got ${res.status} in ${ms}ms`)
    if (res.status === 402) {
      check('402 body carries payment requirements', body != null && typeof body === 'object', 'empty 402 body')
      if (VERBOSE) {
        console.log('\nReceived HTTP 402 Payment Required')
        console.log('   Payment requirements:', JSON.stringify(body, null, 2))
        console.log('\nNote: run with --paid (+ STELLAR_PAYER_SECRET) to settle and verify results.')
        console.log('      The frontend uses @x402/stellar client to sign + retry.')
      }
    } else if (res.status === 200) {
      // Server may be configured without the payment middleware (dev bypass).
      // Do NOT silently pass: surface it, but still validate the paid shape so
      // the script protects something in this configuration too.
      console.log('   WARN: server returned 200 without payment -- payment middleware appears disabled.')
      console.log('     Validating paid response shape instead (no USDC was spent by this script).')
      assertPaidShape(body, query)
      check('tx hash present on unguarded 200 response', typeof body?.txHash === 'string' && body.txHash.length > 0, 'missing txHash -- flow is broken')
      if (VERBOSE) printResults(body, Date.now() - t0)
    } else {
      fail('Unexpected status for unpaid search', `expected 402, got ${res.status}: ${JSON.stringify(body)?.slice(0, 300)}`)
    }

    // The suggestions gate must hold too.
    const suggParams = new URLSearchParams({ q: query, count: String(count), suggestions: '1' })
    const sugg = await fetchJson(`${SERVER}/search?${suggParams}`)
    check('unpaid GET /search?suggestions=1 returns 402', sugg.res.status === 402, `got ${sugg.res.status}`)
    if (sugg.res.status !== 402 && sugg.res.status !== 200) {
      fail('Unexpected status for suggestions gate check', `got ${sugg.res.status}`)
    }

    return finalize()
  }

  // ── Paid mode: full x402 flow (SPENDS TESTNET USDC) ───────────────────────
  console.log(`\n-- Paid flow (SPENDS TESTNET USDC: ${ESTIMATED_PAID_COST_USDC}) --`)
  const secret: string | undefined = process.env.STELLAR_PAYER_SECRET
  if (!secret) {
    fail('Paid mode requires STELLAR_PAYER_SECRET',
      'export STELLAR_PAYER_SECRET=<testnet secret> (funded with XLM + USDC trustline + balance), or run without --paid for the free 402 check')
  }
  const paidFetch = await buildPaidFetch(secret as string)
  if (VERBOSE) console.log('   x402 payer initialised from STELLAR_PAYER_SECRET')

  const { res, body } = await fetchJson(`${SERVER}/search?${params}`, { headers: await paidHeaders(paidFetch, `${SERVER}/search?${params}`) })
  const ms = Date.now() - t0
  check('paid GET /search returns 200', res.status === 200, `got ${res.status}: ${JSON.stringify(body)?.slice(0, 300)}`)
  if (res.status !== 200) fail('Paid search failed', `status ${res.status}`)
  assertPaidShape(body, query)
  const txHash: unknown = (body as any)?.txHash
  check('paid response includes tx hash', typeof txHash === 'string' && (txHash as string).length > 0,
    'missing txHash -- payment may not have settled (check facilitator/server logs)')
  if (typeof txHash !== 'string' || txHash.length === 0) fail('Missing tx hash in paid response')
  console.log(`   Latency: ${ms}ms | Paid: ${(body as any).paidAmount} ${(body as any).currency} | TX: ${txHash}`)

  if (VERBOSE) printResults(body, ms)

  // ── 4. Groq AI (free, non-payment route -- verbose demo only) ──
  console.log('\n-- Groq AI check --')
  {
    const { res: aiRes, body: aiData } = await fetchJson(`${SERVER}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `Summarise what I should know about: ${query}` }],
      }),
    })
    check('POST /ai/chat returns 200', aiRes.status === 200, `got ${aiRes.status}: ${JSON.stringify(aiData)?.slice(0, 200)}`)
    if (aiRes.status === 200) {
      check('AI response has content', typeof aiData?.content === 'string' && aiData.content.length > 0)
      if (VERBOSE) console.log(`   Groq AI (${aiData.model}): ${String(aiData.content).slice(0, 200)}...`)
    }
  }

  // ── 5. AI suggestions (decoupled GET /suggestions?q=...) ──
  console.log('\n-- AI suggestions check (decoupled) --')
  {
    const t1 = Date.now()
    const suggUrl = `${SERVER}/suggestions?q=${encodeURIComponent(query)}`
    const { res: suggRes, body: suggData } = await fetchJson(suggUrl)
    const suggMs = Date.now() - t1
    check('GET /suggestions returns 200', suggRes.status === 200, `got ${suggRes.status}`)
    if (suggRes.status !== 200) fail('Suggestions request failed', `status ${suggRes.status}`)
    const suggestions: unknown = (suggData as any)?.suggestions
    check('suggestions field is an array', Array.isArray(suggestions), `got ${typeof suggestions}`)
    if (Array.isArray(suggestions) && VERBOSE) {
      console.log(`\n   Got ${suggestions.length} AI suggestions (${suggMs}ms total):`)
      ;(suggestions as string[]).forEach((s, i) => console.log(`   ${i + 1}. ${s}`))
    }
  }

  return finalize()
}

runSearch().catch((err) => {
  console.error(`\nUnhandled error: ${err?.message ?? err}`)
  try { printSummary() } catch { /* ignore */ }
  process.exit(1)
})
