# Security Policy

StellarSearch moves money. Every search settles a real x402 payment on Stellar, and the
server holds API keys and a receiving wallet. We take vulnerability reports seriously and
we want to make it easy to tell us about a problem **privately**, before it is public.

---

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

### Preferred channel — GitHub private vulnerability reporting

Use GitHub's private advisory flow:

1. Open the [**Security** tab](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/security)
   of this repository.
2. Click **Report a vulnerability**.
3. Describe the issue. The report is visible only to you and the maintainers until it is
   published.

This gives us a private thread, a place to draft a fix, and a CVE request when one is
warranted.

### Fallback channel

If private vulnerability reporting is unavailable to you, contact a maintainer directly
through their GitHub profile ([Emmy123222](https://github.com/Emmy123222)) and ask for a
private channel. Do not include exploit details in the first public message — just say you
have a security report and we will move the conversation somewhere private.

### What to include

- **Summary** — what the vulnerability is, in one or two sentences.
- **Impact** — what an attacker gains. Loss of funds, key exfiltration, and payment bypass
  are all high priority; a cosmetic UI bug is not.
- **Affected component** — for example `server/index.ts`, `api/`, `mcp-server/`, the
  Freighter/x402 signing path in `src/hooks/useSearch.ts`, or a dependency.
- **Reproduction** — minimal, numbered steps. A proof-of-concept or a request/response
  capture is ideal. Redact your own keys and addresses.
- **Environment** — OS, browser, Node version, Freighter version.
- **Suggested fix** — optional, but very welcome.

If you are unsure whether something counts, report it. We would rather triage a non-issue
than miss a real one.

---

## What to expect from us

| Stage | Target |
|---|---|
| Acknowledge receipt | within **48 hours** |
| Triage and severity assessment | within **5 business days** |
| Fix or documented mitigation | severity-dependent — see below |
| Public disclosure | by agreement, after a fix ships |

Fix targets:

| Severity | Examples | Target |
|---|---|---|
| Critical | Loss of funds, private key exposure, payment/signature bypass | **7 days** |
| High | Auth bypass, server-side secret disclosure, RCE | **30 days** |
| Medium / Low | Denial of service, information leak without secrets, dependency advisories | next release |

We will keep you updated in the private thread, credit you in the advisory unless you ask
us not to, and coordinate the disclosure date with you. Please give us the agreed window
to ship a fix before going public.

There is **no bug bounty** — this is a community hackathon project with no budget for
payouts. We offer credit and our genuine thanks.

---

## Supported versions

StellarSearch is pre-1.0 software under active development. Only the latest `main` is
supported.

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| `1.0.x` | ✅ |
| Older commits / forks | ❌ |

If you are running an older fork, please reproduce the issue against current `main` before
reporting.

---

## This is testnet-first software

**Read this before you report, and before you run anything.**

- The project is built and tested against **Stellar Testnet** (`stellar:testnet`) with
  testnet USDC. The hosted deployment exists to demonstrate the x402 flow, not to move
  real value.
- **Mainnet is not supported.** A `stellar:mainnet` configuration is available in
  `.env.example` for experimentation only. We make no security guarantees about it, and
  you should not put meaningful funds behind it.
- Testnet keys, testnet USDC, and funded testnet accounts have **no monetary value**.
  Compromising a testnet-only key is still interesting to us — the *code path* is the same
  one that would run on mainnet — but it is not a loss of funds.
- Because it is a public demo, anything you paste into a hosted instance (queries, API
  keys you supply, wallet addresses) should be treated as public. Never point the demo at
  a mainnet key that holds real funds.

In short: report anything that would be a serious bug on mainnet, even though the running
deployment is not handling real money.

---

## In scope

- The x402 payment flow: `402` challenge, `X-Payment` header handling, signature
  verification, and settlement in `server/index.ts` and `src/hooks/useSearch.ts`.
- Express server routes, middleware, CORS configuration, and rate limiting (`server/`).
- Vercel serverless equivalents (`api/`).
- MCP server and its tools (`mcp-server/`).
- Secret handling — anything that can leak `SERPER_API_KEY`, `GROQ_API_KEY`,
  `STELLAR_RECEIVING_ADDRESS`, or a user's private key.
- The Freighter wallet integration in the browser (`src/hooks/useFreighterWallet.ts`).
- Vulnerable or malicious dependencies.

## Out of scope

- Anything that only affects a testnet deployment with testnet funds, with no realistic
  mainnet analogue.
- Denial of service through sheer volume against a public demo instance, without a
  specific flaw.
- Missing security headers or best-practice hardening with no demonstrated impact.
- Automated scanner output with no reproduction steps.
- Social engineering of maintainers or contributors.

---

## Safe harbour

We will not pursue or support legal action against researchers who:

- act in good faith and only test against their own accounts and the public demo,
- avoid privacy violations, data destruction, and service degradation,
- do not access, modify, or exfiltrate another person's data or funds,
- give us a reasonable window to fix the issue before public disclosure.

If you are unsure whether your testing crosses a line, ask first via the private channel.

---

## For maintainers

- Keep private vulnerability reporting enabled: **Settings → Code security and analysis →
  Private vulnerability reporting**.
- Triage incoming reports in the private advisory, not in issues.
- Rotate any key that a report suggests may be exposed, then note the rotation in the
  advisory.
- `npm audit` runs against this repo; treat critical advisories in the payment path as
  security issues, not chores.

---

*StellarSearch — Stellar Hackathon 2026 · Agents on Stellar*
