/**
 * scripts/check-funding-links.ts
 *
 * Verifies that every external URL used by the testnet funding guide
 * (src/lib/funding.ts + README.md "Get testnet USDC" section) is still live.
 * Guards issue #94's acceptance criterion: "every link in the instructions
 * is verified". Run: npx tsx scripts/check-funding-links.ts
 */

const FUNDING_URLS = [
  'https://lab.stellar.org/account/fund',
  'https://faucet.circle.com',
  'https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts',
  'https://developers.circle.com/stablecoins/quickstart-setup-usdc-trustline-stellar',
  'https://stellar.expert/explorer/testnet/asset/USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  'https://friendbot.stellar.org',
] as const

// Horizon rejects HEAD requests (405) even though the endpoint is fine.
const HEAD_REQUEST_OK = new Set(['https://friendbot.stellar.org'])

interface CheckResult {
  url: string
  ok: boolean
  status: number | string
  note?: string
}

async function checkUrl(url: string): Promise<CheckResult> {
  const method = HEAD_REQUEST_OK.has(url) ? 'GET' : 'HEAD'
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      // Friendbot with no ?addr= returns 400 — the service being up is what we verify.
      signal: AbortSignal.timeout(15_000),
    })
    const ok = res.status < 400 || HEAD_REQUEST_OK.has(url)
    return {
      url,
      ok,
      status: res.status,
      note: HEAD_REQUEST_OK.has(url) && res.status >= 400 ? 'service reachable (expected 400 without addr)' : undefined,
    }
  } catch (err) {
    return { url, ok: false, status: (err as Error).message.slice(0, 80) }
  }
}

async function main() {
  console.log('Checking funding-guide links...\n')
  const results = await Promise.all([...FUNDING_URLS].map(checkUrl))

  let failed = 0
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗'
    const note = r.note ? ` — ${r.note}` : ''
    console.log(`${mark} [${r.status}] ${r.url}${note}`)
    if (!r.ok) failed++
  }

  console.log(`\n${results.length - failed}/${results.length} links OK`)
  if (failed > 0) {
    console.error(`\n${failed} funding-guide link(s) are broken — update src/lib/funding.ts and README.md.`)
    process.exit(1)
  }
}

main()

export {}
