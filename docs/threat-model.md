# Payment Flow Threat Model

**Status:** Living document
**Last reviewed:** 2026-09-30
**Applies to:** x402 / Stellar pay-per-query flow (`server/`, `api/`, `src/hooks/useSearch.ts`, `mcp-server/`)
**Related:** [`SECURITY.md`](../SECURITY.md) · [`CONTRIBUTING.md`](../CONTRIBUTING.md) · [`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md)

---

## 1. Purpose and scope

StellarSearch sells a single unit of value — one web, image, or news search query — for a fixed
on-chain price of `0.001 USDC` on the Stellar network. There is **no account, no session, and no
API key**; the payment _is_ the authentication.

That design removes an entire class of credential-management bugs, but it inverts the usual
failure mode. In a conventional API, the danger is a requester who cannot pay. In an x402 API, the
danger is a requester who can obtain the resource **without** the network ever confirming that a
transfer settled. A single missing check on the server is a 100% revenue loss, not a partial one.

This document therefore exists to answer three questions precisely:

1. **Where are the trust boundaries** between the client, the backend, the facilitator, and the
   Stellar network?
2. **What is each party trusted to assert**, and what must the server verify _independently_ rather
   than take on faith?
3. **Which attacks have been considered**, and for each: is it mitigated, planned, or explicitly
   accepted?

### Out of scope

- Wallet key custody. The project never holds a user private key; Freighter does. See
  [T-24](#t-24-user-wallet-compromise-and-key-theft).
- The security of the Stellar protocol, Soroban, or the x402 protocol specification themselves.
  We treat both as correct and outside our control.
- Availability and DDoS of third-party infrastructure we do not own.

### How to read the risk ratings

| Rating       | Meaning                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| **Critical** | Directly yields unpaid resource delivery or loss of funds.                             |
| **High**     | Materially weakens payment guarantees, or leaks funds/data under realistic conditions. |
| **Medium**   | Requires a secondary condition, or degrades a control rather than removing it.         |
| **Low**      | Defense-in-depth or hardening item with limited direct impact.                         |
| **Accepted** | Understood, consciously not mitigated at this stage, and recorded in §6.               |

---

## 2. System overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│  CLIENT  (src/)                          TRUST BOUNDARY 1: untrusted        │
│  useSearch.ts · useFreighterWallet.ts                                       │
│                                                                            │
│  Untrusted: q params, counts, headers, everything in localStorage.         │
│  Trusted:   nothing. The client is assumed hostile.                       │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │  GET /search?q=…
                               │  ← 402 + PAYMENT-REQUIRED (base64)
                               │  → PAYMENT-SIGNATURE (signed Soroban auth entry)
                               │  ← 200 + results  /  402 on failure
┌──────────────────────────────▼────────────────────────────────────────────┐
│  BACKEND  (server/index.ts, api/search.ts)     TRUST BOUNDARY 2: semi-trusted
│                                                                            │
│  Holds secrets: SERPER_API_KEY, GROQ_API_KEY, STELLAR_RECEIVING_ADDRESS.   │
│  Owns the price. Computes the authoritative payment requirement.           │
│  All merchant logic lives here.                                            │
└───────────┬────────────────────────────────────┬───────────────────────────┘
            │ POST /verify                        │ POST /settle
            │ POST /settle                        │
┌───────────▼────────────────────────────────────▼───────────────────────────┐
│  FACILITATOR  (FACILITATOR_URL → https://www.x402.org/facilitator)         │
│                                                    TRUST BOUNDARY 3       │
│  Third party. Performs ALL signature verification, tx simulation, and     │
│  submission. We assert its verdict; we do not independently re-derive it.  │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │  submit / simulate / query
┌──────────────────────────────▼────────────────────────────────────────────┐
│  STELLAR NETWORK  (Horizon + Soroban RPC, public endpoints)                │
│                                                    TRUST BOUNDARY 4       │
│  The root of trust for *value*. Consensus-final, publicly auditable,       │
│  and therefore the only source we would accept as final settlement proof.   │
└───────────────────────────────────────────────────────────────────────────┘
```

### The two server implementations (read this before trusting anything)

The repository ships **two independent implementations of the paid route**, and they are not
equivalent.

|                                | `server/index.ts` (Express)        | `api/search.ts` (Vercel) |
| ------------------------------ | ---------------------------------- | ------------------------ |
| Payment enforcement            | `@x402/express` middleware         | **Hand-rolled**          |
| Verifies signature / settles   | Yes, via facilitator               | **No**                   |
| Amount / asset / `payTo` check | Yes, via `deepEqual` on `accepted` | **No**                   |
| CORS in production             | `ALLOWED_ORIGINS` allowlist        | **Hard-coded `*`**       |
| Input length cap               | 256 chars (`server/index.ts:118`)  | None                     |

**`api/search.ts` is not a mirror of the Express server.** It only checks that a `payment-signature`
header is _present_; any non-empty value — including the literal string `x` — passes and the search
is served. This is tracked as [T-15](#t-15-serverless-route-bypasses-payment-verification-entirely)
(Critical) and is the single most important item in this document. Until it is fixed, **the Vercel
deployment must be considered to have no payment enforcement.**

---

## 3. Trust boundaries

### TB-1 Client to backend

**Crossing:** HTTP request/response carrying the query and the signed payment header.

The client is **fully untrusted**. It is a browser tab under the control of whoever loaded the page.
The network path may be hostile, and `localStorage` (used for receipts in `DashboardPage.tsx:22`)
is writable by any script on the origin.

Everything arriving from this side is attacker-controlled input: `q`, `count`, `freshness`,
`payment-signature`, and every header. The boundary is crossed by the client _asserting_ facts about
itself — notably the `accepted` block inside the payment payload, which claims "I agree to pay this
much, to this address, in this asset, on this network." That assertion is worthless on its own and
must be checked against server-computed values ([T-02](#t-02-amount-tampering-and-underpayment),
[T-03](#t-03-asset-substitution), [T-04](#t-04-payto-redirection)).

The client is trusted for exactly one thing: **that it controls a private key**, and only because the
Soroban auth entry is cryptographically bound to that key. It is never trusted for correctness of
amount, for payment state, or for having actually paid.

### TB-2 Backend to upstream providers

**Crossing:** Outbound HTTPS to Serper.dev and Groq with the user's query, and the returned content.

This is a **data-egress boundary**, not a payment boundary, but it sits inside the payment flow
because the merchant cost is incurred here. The backend sends the user's raw query to two external
processors and injects the top three Serper snippets into a Groq prompt
(`server/index.ts:207-231`). Both providers are therefore inside the trust boundary for
_confidentiality of user queries_ and _integrity of returned content_, and neither is inside it for
payment correctness.

The merchant cost is also incurred at this boundary, and — critically — **before** settlement is
attempted. See [T-22](#t-22-upstream-cost-incurred-before-settlement-is-attempted).

### TB-3 Backend to facilitator

**Crossing:** `POST {FACILITATOR_URL}/verify` and `POST {FACILITATOR_URL}/settle`.

This is the **most consequential trust boundary in the system.** The facilitator is a third party
that decides two things on our behalf:

1. Is this payment authentic? (signature validity, transaction simulation, nonce/sequence,
   ledger-expiry bounds.)
2. Did this payment settle? (`success` boolean plus a transaction hash.)

**This repository performs no cryptographic verification of its own.** Every check in §4.2
attributed to "verification" is executed inside the facilitator process. We hold no Stellar signing
capability and no ledger reader that would let us re-derive those results.

Consequences we accept consciously:

- We construct the facilitator client with `{ url }` only (`server/index.ts:89`). The
  `HTTPFacilitatorClient` API supports `createAuthHeaders` for mutual authentication, and we do not
  use it. Anyone who can intercept or spoof the facilitator URL is a full compromise
  ([T-07](#t-07-compromised-or-intercepted-facilitator-accepts-forged-payments)).
- Facilitator responses are schema-validated (`verifyResponseSchema`, `settleResponseSchema`) and a
  malformed response raises `FacilitatorResponseError` rather than being trusted — this is the one
  real defense we have at this boundary.
- We trust TLS for transport integrity. We do not pin certificates, and the facilitator does not sign
  its responses, so a TLS-terminating proxy is fully trusted.

### TB-4 Facilitator to Stellar network

**Crossing:** `simulateTransaction` / `submitTransaction` / ledger queries against public Horizon and
Soroban RPC endpoints.

The Stellar network is the **root of trust for value**. The facilitator is a convenience layer over
it; in principle every claim the facilitator makes is independently checkable against a ledger we
do not control. In practice this repository does not perform that cross-check — we accept the
facilitator's `success` flag and transaction hash without confirming the transaction reached a
finalized ledger ([T-11](#t-11-facilitator-reports-success-for-a-transaction-that-never-settled)).

---

## 4. Party trust and verification matrix

### 4.1 What each party is trusted for

| Party                   | Trusted for                                                                                                                         | Explicitly **not** trusted for                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Client** (`src/`)     | Possession of a Stellar private key, evidenced by a valid Soroban auth-entry signature. Intent to complete the payment it is shown. | Amount, asset, `payTo`, network, or any other field it echoes back. Any claim that a prior payment settled. Its own rendering of the payment requirements.                                                               |
| **Backend** (`server/`) | Nothing externally. It is the _source of truth_ for price, asset, `payTo`, and network. It owns secrets.                            | —                                                                                                                                                                                                                        |
| **Facilitator**         | `isValid` on `POST /verify`; `success` + `transaction` on `POST /settle`; `areFeesSponsored` advertised via `GET /supported`.       | Response integrity beyond TLS. Its availability (see [T-08](#t-08-facilitator-unavailability-and-missing-timeouts-on-outbound-calls)). Its silence — an absent `transaction` field is a schema violation, not a success. |
| **Stellar network**     | Final settlement truth: balances, ledger ordering, auth-entry expiry (`maxLedger`), contract identity of the USDC asset.            | Nothing further; it _is_ the ground truth.                                                                                                                                                                               |
| **Serper.dev**          | Accuracy of organic search results.                                                                                                 | Integrity of snippets as untrusted text fed to an LLM ([T-21](#t-21-prompt-injection-via-search-result-snippets)).                                                                                                       |
| **Groq**                | Model output quality.                                                                                                               | That it treats injected snippet text as data rather than instructions.                                                                                                                                                   |

### 4.2 What the server must verify independently

These are the invariants a payment server owes its merchant. Each row states the check, where it
currently happens, and the required strength.

| #    | Check                                                                                                                                                         | Current implementation                                                                                                                                               | Required                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-1  | **Requirement match** — client `accepted` deep-equals the server-computed requirement (scheme, network, amount, asset, `payTo`, `maxTimeoutSeconds`, `extra`) | `x402ResourceServer.findMatchingRequirements` → `deepEqual`, `@x402/core/dist/esm/server/index.mjs:632-647`                                                          | **Mandatory, server-side.** Never compare the client's copy against a copy the client also sent.                                                                                         |
| V-2  | **Signature validity** of the Soroban auth entry                                                                                                              | Delegated: `facilitatorClient.verify` → `POST /verify`                                                                                                               | **Mandatory**, and the facilitator must be authenticated ([T-07](#t-07-compromised-or-intercepted-facilitator-accepts-forged-payments)).                                                 |
| V-3  | **Amount is exactly the quoted price**, in the quoted asset, on the quoted network                                                                            | Derived from `parsePrice(0.001)` → `convertToTokenAmount` → `"10000"` stroops, `@x402/stellar/dist/esm/exact/server/index.mjs:37-106`; enforced by V-1               | **Mandatory.** Price is owned by the server, never by the client.                                                                                                                        |
| V-4  | **Destination is our own receiving address**                                                                                                                  | `payTo: RECEIVING_ADDRESS` from `STELLAR_RECEIVING_ADDRESS` (`server/index.ts:46,68`)                                                                                | **Mandatory.** A mismatch must never be treated as "close enough."                                                                                                                       |
| V-5  | **Asset is the expected USDC Soroban contract**                                                                                                               | Implicit via V-1; address sourced from `@x402/stellar` internals, _not_ from `src/lib/constants.ts`                                                                  | **Mandatory and explicit.** See the address disagreement in [T-25](#t-25-usdc-contract-address-disagreement-between-implementations).                                                    |
| V-6  | **Non-replay** — a given auth entry / sequence is consumed at most once                                                                                       | Soroban account sequence + the facilitator; **no server-side nonce cache exists**                                                                                    | **Mandatory.** Currently implicit only ([T-01](#t-01-replay-of-a-captured-payment-header)).                                                                                              |
| V-7  | **Temporal validity** — auth entry not expired, bounded by `maxLedger`                                                                                        | Client computes `maxLedger = currentLedger + ceil(maxTimeoutSeconds / ledgerCloseTime)`; server sets `maxTimeoutSeconds` (default 300)                               | **Mandatory**, enforced by the facilitator against on-chain state.                                                                                                                       |
| V-8  | **Settlement actually happened** — a transaction reached a finalized ledger with the expected recipient and amount                                            | Trusted from `settle` response: `success` + `transaction`                                                                                                            | **Mandatory.** The server must confirm, at minimum, that `transaction` is a non-empty well-formed hash ([T-11](#t-11-facilitator-reports-success-for-a-transaction-that-never-settled)). |
| V-9  | **Resource delivered only after V-8**                                                                                                                         | Buffered by `@x402/express` — the handler runs, output is buffered, settlement is attempted, then the buffer is flushed (`@x402/express/dist/esm/index.mjs:197-316`) | **Mandatory.** Buffers are flushed _before_ settlement only when `statusCode >= 400` — i.e. error responses are free ([T-20](#t-20-free-service-on-upstream-error-paths)).               |
| V-10 | **Header well-formedness**                                                                                                                                    | `decodePaymentSignatureHeader`: base64 regex → decode → `JSON.parse`. Failures `return null` and are treated as unpaid                                               | **Mandatory.** Fail-closed to 402. Currently correct.                                                                                                                                    |
| V-11 | **Request sanity** — bounded query length, control-char stripping, clamped `count`                                                                            | `validateQuery()` (`server/index.ts:123-139`), `MAX_QUERY_LENGTH = 256`, `count` clamped to ≤ 20                                                                     | **Mandatory** on both implementations; **absent** in `api/search.ts` ([T-15](#t-15-serverless-route-bypasses-payment-verification-entirely)).                                            |
| V-12 | **Settlement amount cannot be overridden by the client**                                                                                                      | `Settlement-Overrides` response header supported by the library; **not used here**                                                                                   | **Mandatory.** Must remain unset; a client-supplied override would let a payer dictate the amount ([T-12](#t-12-settlement-overrides-header-abuse)).                                     |

> **Design note.** V-1 through V-8 are implemented _for_ us by `@x402/core` and `@x402/stellar`
> (v2.9.0) plus the remote facilitator. This document records the guarantees we are relying on so
> that a dependency bump is treated as a security change. The `amount: AMOUNT_STROOPS` field at
> `server/index.ts:69` is currently **ignored** — `parsePrice` honours `amount` only when `price` is
> an object, so `price: 0.001` alone determines the charge. Two sources of truth for one number is a
> latent defect.

---

## 5. Attack enumeration and mitigations

Ratings describe the state of the code on the reviewed commit, not the theoretical severity.

| ID                                                                                  | Attack                                 | Boundary   | Rating       | Status                                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------- | ---------- | ------------ | ----------------------------------------------------------------------- |
| [T-01](#t-01-replay-of-a-captured-payment-header)                                   | Replay of a captured payment header    | TB-1       | High         | Mitigated by facilitator + Soroban sequence; no server-side nonce cache |
| [T-02](#t-02-amount-tampering-and-underpayment)                                     | Amount tampering / underpayment        | TB-1       | High         | **Mitigated** (V-1)                                                     |
| [T-03](#t-03-asset-substitution)                                                    | Asset substitution                     | TB-1       | High         | **Mitigated** (V-1), implicit only                                      |
| [T-04](#t-04-payto-redirection)                                                     | `payTo` redirection                    | TB-1       | High         | **Mitigated** (V-1, V-4)                                                |
| [T-05](#t-05-network-confusion-between-testnet-and-mainnet)                         | Testnet/mainnet confusion              | TB-1, TB-3 | Medium       | Partially mitigated                                                     |
| [T-06](#t-06-malformed-or-garbage-payment-header)                                   | Malformed / garbage payment header     | TB-1       | Low          | **Mitigated** (V-10, fail-closed)                                       |
| [T-07](#t-07-compromised-or-intercepted-facilitator-accepts-forged-payments)        | Compromised or MITM'd facilitator      | TB-3       | **Critical** | **Accepted** (§6)                                                       |
| [T-08](#t-08-facilitator-unavailability-and-missing-timeouts-on-outbound-calls)     | Facilitator unavailability, no timeout | TB-3       | Medium       | Unmitigated                                                             |
| [T-09](#t-09-race-condition-on-concurrent-requests)                                 | Race condition on concurrent requests  | TB-1, TB-3 | Medium       | Unmitigated                                                             |
| [T-10](#t-10-post-settlement-failure-where-service-is-delivered-and-funds-are-lost) | Post-settlement failure                | TB-3, TB-4 | Medium       | Unmitigated                                                             |
| [T-11](#t-11-facilitator-reports-success-for-a-transaction-that-never-settled)      | Settlement reported but not on-chain   | TB-3       | **Critical** | **Accepted** (§6)                                                       |
| [T-12](#t-12-settlement-overrides-header-abuse)                                     | `Settlement-Overrides` abuse           | TB-1       | Low          | Mitigated (unused)                                                      |
| [T-13](#t-13-nonce-and-sequence-manipulation)                                       | Nonce / sequence manipulation          | TB-1       | High         | Mitigated by Soroban + facilitator                                      |
| [T-14](#t-14-expired-or-out-of-window-auth-entry)                                   | Expired auth entry                     | TB-1, TB-3 | Low          | **Mitigated** (V-7)                                                     |
| [T-15](#t-15-serverless-route-bypasses-payment-verification-entirely)               | Serverless route bypasses payment      | TB-2       | **Critical** | **Unmitigated**                                                         |
| [T-16](#t-16-wildcard-cors-on-the-serverless-route)                                 | Wildcard CORS on serverless route      | TB-2       | High         | Unmitigated                                                             |
| [T-17](#t-17-unauthenticated-resource-drain-and-no-rate-limiting)                   | Unauthenticated resource drain         | TB-2       | High         | Unmitigated                                                             |
| [T-18](#t-18-mcp-server-wallet-abuse)                                               | MCP server wallet abuse                | TB-2       | Medium       | **Accepted** (§6)                                                       |
| [T-19](#t-19-secret-exposure)                                                       | Secret exposure                        | TB-2       | High         | Partially mitigated                                                     |
| [T-20](#t-20-free-service-on-upstream-error-paths)                                  | Free service on error paths            | TB-2       | Medium       | Mitigated by design (fail-cheap)                                        |
| [T-21](#t-21-prompt-injection-via-search-result-snippets)                           | Prompt injection via snippets          | TB-2       | Medium       | Mitigated by system prompt                                              |
| [T-22](#t-22-upstream-cost-incurred-before-settlement-is-attempted)                 | Cost before settlement                 | TB-2, TB-3 | Medium       | **Accepted** (§6)                                                       |
| [T-23](#t-23-front-running-and-mempool-extraction)                                  | Front-running                          | TB-4       | Info         | Not applicable                                                          |
| [T-24](#t-24-user-wallet-compromise-and-key-theft)                                  | User wallet compromise                 | TB-1       | High         | Out of scope (Freighter)                                                |
| [T-25](#t-25-usdc-contract-address-disagreement-between-implementations)            | USDC contract address disagreement     | TB-1       | Medium       | Unmitigated                                                             |
| [T-26](#t-26-client-records-a-false-receipt)                                        | False receipt recorded                 | TB-1       | Low          | Unmitigated                                                             |
| [T-27](#t-27-resource-exhaustion-on-unpaid-free-endpoints)                          | Resource exhaustion on free endpoints  | TB-2       | High         | Unmitigated                                                             |

---

### T-01 Replay of a captured payment header

**Attack.** An attacker who observes one valid `PAYMENT-SIGNATURE` header — from a proxy log, a
browser extension, a shared machine, a HAR file, or a Referer-style leak — replays it on every
subsequent request. If a signed auth entry is not single-use, one 0.001 USDC payment yields unlimited
searches.

**Why it is hard here.** x402's `exact` scheme on Stellar authorizes a _transfer_ via a signed
Soroban auth entry. The payer account's **sequence number** is part of that signature. Replaying an
auth entry requires re-submitting against a sequence number already consumed, which the network
rejects, and the facilitator simulates the transaction before submitting — so a spent entry fails
verification rather than settling twice.

**Residual risk.** That protection is inherited from Soroban and lives in the facilitator, not in
this codebase. We hold **no server-side record of consumed payments**: no nonce store, no
idempotency key, no seen-transaction cache. If any layer in that chain were to weaken, the server
would have no second line of defence and would not be able to detect the duplication.

**Mitigation / status.** Mitigated in depth by the network, but defence-in-depth is missing at the
application layer. Add a short-lived cache keyed on the auth-entry signature hash and/or the
settlement transaction hash, and reject any repeat within the `maxTimeoutSeconds` window.

---

### T-02 Amount tampering and underpayment

**Attack.** The client fetches the 402, then rewrites the `accepted.amount` inside its payment
payload from `"10000"` to `"1"` stroop (or to a different asset) and signs. It then presents the
server with a signature over the cheaper terms.

**Mitigation.** This is the core of V-1. The server computes the requirement itself —
`price: parseFloat(AMOUNT_USDC)` at `server/index.ts:68` is converted by
`ExactStellarScheme.parsePrice` → `convertToTokenAmount('0.001', 7)` → `"10000"` stroops, with
`asset` from the network's USDC contract and `payTo` from `STELLAR_RECEIVING_ADDRESS`. The client's
`accepted` block is then compared with `deepEqual` against that server-computed object
(`@x402/core/dist/esm/server/index.mjs:632-647`). Any divergence in amount, asset, `payTo`,
network, scheme, `maxTimeoutSeconds`, or `extra` produces no match and a 402 with
`"No matching payment requirements"`.

**Status: mitigated.** The client's copy of the price is never trusted. Two caveats are recorded in
§4.2: the redundant `amount` field at `server/index.ts:69` is silently ignored, and the comparison is
exact-equality on the whole object, so any _future_ addition to the requirements object (for example a
new `extra` key advertised by the facilitator) is a breaking change for every client.

---

### T-03 Asset substitution

**Attack.** The client claims agreement to pay in a worthless or attacker-controlled token that
merely _looks_ like USDC, or supplies a different `asset` contract address, thereby paying ~0 in
value while satisfying the header.

**Mitigation.** Covered by the same `deepEqual` as T-02: `asset` is part of the compared object and is
derived server-side. The client cannot substitute it.

**Residual risk.** The address the Express server actually uses is the one internal to
`@x402/stellar`, not the one in `src/lib/constants.ts`, and the two disagree on mainnet — see
[T-25](#t-25-usdc-contract-address-disagreement-between-implementations). The check is only as
strong as the correctness of the configured address, and neither implementation validates the asset
address against a chain query.

**Status: mitigated,** with the address-integrity gap in T-25 outstanding.

---

### T-04 `payTo` redirection

**Attack.** The client sets `payTo` to the attacker's own account. The payment is real, valid, and
settles on-chain — but the funds never reach the merchant.

**Mitigation.** `payTo` is server-owned (`server/index.ts:46,68`) and is part of the `deepEqual`
comparison. A redirected `payTo` cannot match, so the request is rejected before any settlement is
attempted.

**Residual risk.** `STELLAR_RECEIVING_ADDRESS` is read with a non-null assertion and only warned
about when missing (`server/index.ts:52`). If it is unset, `payTo` is `undefined` and the server
builds a requirement it cannot honestly honour. The startup path should **fail hard** on a missing or
malformed `G...` address rather than warn and continue.

**Status: mitigated,** contingent on the receiving address being configured correctly.

---

### T-05 Network confusion between testnet and mainnet

**Attack.** A mismatch between the network the client signs on, the network the server expects, and
the network the facilitator settles on. Impact varies: on testnet, real code paths are exercised with
worthless tokens, so a production deployment accidentally running against testnet would serve search
results for free while showing a plausible-looking payment flow.

**Mitigation.** The network is a build-time constant (`STELLAR_NETWORK`, `server/index.ts:48`) and is
part of both the `deepEqual` comparison and the facilitator client/scheme key, so a signed entry for
the wrong network cannot match. The client independently asserts the Freighter network before
constructing a signer (`useSearch.ts:88-94`) and surfaces a clear message on mismatch.

**Residual risk.** The server does not assert its own network against a live query. Nothing detects
"this deployment is on testnet" at runtime; it is visible only by reading configuration. A
startup self-check that queries Horizon for `STELLAR_RECEIVING_ADDRESS` and fails loudly on an
unexpected network would close this.

**Status: partially mitigated.**

---

### T-06 Malformed or garbage payment header

**Attack.** Flood the endpoint with junk in `payment-signature` hoping to trigger a parser crash, an
unhandled exception, or a fail-open path that skips the payment check.

**Mitigation.** `decodePaymentSignatureHeader` validates against
`/^[A-Za-z0-9+/]*={0,2}$/`, base64-decodes, and `JSON.parse`s. Any throw is caught and the function
returns `null` (`@x402/core/dist/esm/chunk-JFGRL3BL.mjs:459-469`). A `null` result is treated as _no
payment supplied_, so the request falls through to a 402. The behaviour is **fail-closed**.

**Residual risk.** This fail-closed path is exactly what `api/search.ts` does _not_ do — it
base64-decodes defensively inside a `try/catch` whose failure is ignored, and serves the search
anyway. See [T-15](#t-15-serverless-route-bypasses-payment-verification-entirely).

**Status: mitigated on the Express route; the inverse defect exists on the serverless route.**

---

### T-07 Compromised or intercepted facilitator accepts forged payments

**Attack.** The facilitator is a third-party HTTP service reached by URL
(`FACILITATOR_URL`, default `https://www.x402.org/facilitator`). An attacker who controls that host
— via DNS, a compromised CA, a malicious proxy, or a misconfigured environment variable — can
return `{"isValid": true}` for a forged payment and `{"success": true, "transaction": "..."}` for a
settlement that never occurred. Every request is then served for free, indefinitely, with no trace on
the ledger.

**Why this is Critical.** The facilitator is the _entire_ verification and settlement authority. This
repository holds no signing keys and performs no independent signature or ledger check, so there is
nothing to catch the substitution. The trust is total.

**Existing controls.**

- TLS provides transport integrity and server authentication of the _hostname_.
- Facilitator responses are validated against `verifyResponseSchema` and `settleResponseSchema`; a
  non-conforming response raises `FacilitatorResponseError` rather than being acted on.
- A facilitator that errors produces HTTP 502, not a served resource.

**Gap.** `new HTTPFacilitatorClient({ url: FACILITATOR_URL })` (`server/index.ts:89`) passes **no
`createAuthHeaders`**, although the client supports it. There is no mutual authentication, no
certificate pinning, and no response signature. The URL is environment-supplied with a permissive
default, so an environment-variable injection is enough to redirect all payment decisions.

**Status: ACCEPTED (see §6).** Recorded rather than mitigated. Documented compensating control: pin
`FACILITATOR_URL` in the deployment platform's environment, review it during environment changes, and
treat any change to it as a security-relevant deployment.

---

### T-08 Facilitator unavailability and missing timeouts on outbound calls

**Attack.** The facilitator is slow, rate-limits us, or is down. `HTTPFacilitatorClient.verify` and
`.settle` call `fetch` with **no `AbortSignal` and no timeout**
(`@x402/core/dist/esm/chunk-JFGRL3BL.mjs:731,773,816`). Every in-flight request hangs, consuming a
Node event-loop slot and a socket until the platform's own timeout kills it. A modest number of
concurrent requests can exhaust the connection pool or the serverless concurrency budget.

Note that `maxTimeoutSeconds: 300` is a **client-side ledger-expiry bound on the Soroban auth entry,
not an HTTP timeout**, and must not be mistaken for one. The only retry logic in the library is on
`GET /supported` (3 attempts, exponential backoff on 429).

**Amplifier.** `/ai/chat` is free and calls Groq directly with no throttle, so it does not even reach
the facilitator to hang ([T-27](#t-27-resource-exhaustion-on-unpaid-free-endpoints)).

**Mitigation.** Wrap every facilitator call in an `AbortSignal.timeout(...)` and fail closed with 402
after a short budget. Add per-IP rate limiting to bound concurrent in-flight verification.

**Status: unmitigated.** A known, low-effort fix.

---

### T-09 Race condition on concurrent requests

**Attack.** A client fires N simultaneous requests, all carrying the _same_ signed payment header,
hoping to slip several of them through before the sequence number is observed as consumed. This is
the concurrency-scaled form of [T-01](#t-01-replay-of-a-captured-payment-header).

**Why it is hard here.** The underlying protection is atomic: the network consumes the payer's
sequence number, and a second submission with the same sequence is rejected by consensus. There is no
read-then-write window in our code to race, because we perform no payment-state read of our own.

**Residual risk.** The rejection surfaces as a facilitator `isValid: false` → 402 for the losing
requests, so correctness holds but _availability_ suffers: legitimate concurrent use from a client
that batches searches will see spurious 402s. There is no server-side coordination to convert these
into a clean, retryable error, and the client simply retries
(`useSearch.ts`), which multiplies the load against T-08.

**Mitigation.** Once a nonce cache exists (T-01), make the consume operation atomic and return an
explicit "payment already consumed" error rather than a generic 402.

**Status: unmitigated** at the application layer; correctness relies on the network.

---

### T-10 Post-settlement failure where service is delivered and funds are lost

**Attack.** Not adversarial — a reliability risk. Settlement succeeds on-chain, but the buffered
response is lost: the client disconnects, the platform kills the function after the transfer
submitted, or the response fails to flush. The payer has been charged and receives nothing, with no
receipt, because the transaction hash was never delivered to them.

**Why this matters here.** A failed payment costs 0.001 USDC — small. But the failure is invisible to
the user, who sees a network error and reasonably assumes nothing was charged, and it is invisible to
us, because `server/index.ts:203`, `:298`, and `:376` read `req.headers['x-payment-response']`, which
is a **request** header and therefore always `null` at that point. The middleware emits
`PAYMENT-RESPONSE` as a _response_ header, after the handler has already returned. The intended
receipt mechanism does not function on any route.

**Mitigation.** Record every settlement attempt server-side — the tx hash, payer, amount, timestamp —
keyed by the payment payload, so a charged-but-undelivered request can be reconciled and refunded
or re-served. Deliver the transaction hash to the client from the actual settlement response.

**Status: unmitigated.** The logging middleware at `server/index.ts:95-114` does not close this gap:
it infers `paymentStatus` purely from the HTTP status code and never observes settlement, and it
covers `/search` only.

---

### T-11 Facilitator reports success for a transaction that never settled

**Attack.** A compromised or buggy facilitator returns `{"success": true, "transaction": "0x..."}`
for a transaction that was never submitted, was rejected on-chain, or settled to a different amount
or recipient than expected. Because the server trusts the flag and performs no cross-check, the
resource is released and the payment is never collected.

**Existing controls.** The response is schema-validated: `settleResponseSchema` requires `transaction`
to be a **string** and `success` a **boolean**, and a violation raises an error rather than being
treated as success. A `success: false` yields a 402 and the buffered response is discarded.

**Gap.** Nothing checks that the hash is well-formed, and — more importantly — nothing queries
Horizon or Soroban RPC to confirm the transaction reached a **finalized ledger** with the expected
`payTo` and amount. `client-side` Horizon helpers already exist
(`HORIZON_URL` in `src/lib/constants.ts:27`), so a post-settlement confirmation query is
straightforward to add. The cost is one extra network round-trip per paid request.

**Status: ACCEPTED (see §6).** This is the deliberate, documented consequence of delegating
verification to the facilitator. It is the accepted cost of not operating a Stellar node.

---

### T-12 Settlement-Overrides header abuse

**Attack.** The x402 server library supports a `Settlement-Overrides` response header letting the
_resource server_ instruct the facilitator to settle a fraction or absolute amount different from the
quoted price (e.g. `"50%"`, `"$0.0015"`, resolved at
`@x402/core/dist/esm/server/index.mjs:24-38`, applied at `:271-281`). If this value were ever
derived from client input, a payer would be able to dictate how much it is charged.

**Mitigation.** `processSettlement` is invoked with no override argument from this application, and
no code path in `server/`, `api/`, or `src/` writes a `Settlement-Overrides` header. The quoted price
is therefore always the settled price.

**Status: mitigated by non-use.** Recorded so that a future "discount" or "promo pricing" feature
introducing overrides is treated as a payment-integrity change requiring review, not a cosmetic one.

---

### T-13 Nonce and sequence manipulation

**Attack.** The client supplies a sequence number far in the future, or reuses one across concurrent
requests, to make an auth entry appear valid, to delay the payer's other transactions, or to
monopolise a sequence slot.

**Mitigation.** The sequence number is part of the signed auth entry, so it cannot be altered without
invalidating the signature. Soroban enforces monotonicity, and the facilitator simulates the
transaction — which requires the sequence to be valid and next — before submitting.

**Residual risk.** All of this is the facilitator's and the network's work. The server has no
visibility, and a sequence gap in the payer's account manifests to the user as a confusing failure at
settlement time rather than a clear pre-flight error.

**Status: mitigated** by Soroban and the facilitator.

---

### T-14 Expired or out-of-window auth entry

**Attack.** Capture a valid payment header and replay it well after the auth entry's validity window,
hoping verification does not re-check expiry.

**Mitigation.** `maxTimeoutSeconds` is set by the server (default `300`,
`@x402/core/dist/esm/server/index.mjs:328`) and is part of the `deepEqual` comparison, so the client
cannot widen it. The client converts it to a concrete ledger bound —
`maxLedger = currentLedger + ceil(maxTimeoutSeconds / estimatedLedgerCloseTime)`
(`@x402/stellar/dist/esm/chunk-MNJSE67H.mjs:50-53,77-81`) — and the facilitator validates that bound
against current on-chain ledger state.

**Residual risk.** The `maxLedger` computation depends on the client's estimate of ledger close time
and on a **public, unauthenticated** Soroban RPC (`soroban-testnet.stellar.org` /
`soroban-rpc.mainnet.stellar.org`, hard-coded in `useSearch.ts:29-31`). A hostile or degraded RPC
could report a stale or skewed current ledger, producing a `maxLedger` that is too generous or too
tight. The server-side `maxTimeoutSeconds` cap bounds the damage in the "too generous" direction, and
the facilitator's own ledger read is authoritative in the "too tight" direction.

**Status: mitigated.**

---

### T-15 Serverless route bypasses payment verification entirely

**Attack.** `api/search.ts` — the Vercel production path — does **not** use the `@x402` packages. It
reads the payment header (`api/search.ts:40-44`) and, if any non-empty value is present, logs
`✅ Payment header received` and proceeds straight to the Serper.dev call
(`api/search.ts:74-86`). The only thing extracted from the header is an optional transaction hash
used for display; a base64/JSON parse failure is swallowed by a `catch` that explicitly treats it as
acceptable.

A single request with `payment-signature: x` therefore returns full paid search results. There is no
signature check, no amount check, no asset check, no `payTo` check, no facilitator call, and no
settlement.

**Why it is Critical.** This is not a theoretical weakness; it is a complete absence of the payment
control on the deployment path that the Vercel configuration targets. It is compounded by
`api/search.ts:37` accepting an unbounded, unstripped `q` (no `MAX_QUERY_LENGTH`, no control-character
removal — so the log-injection defence present at `server/index.ts:134` is missing here too), and by
`api/search.ts:17` hard-coding `Access-Control-Allow-Origin: *`, which lets any web page on the
internet call it directly from a victim's browser.

**Mitigation.**

1. Replace the hand-rolled check in `api/search.ts` with `paymentMiddlewareFromConfig` from
   `@x402/express`, or port the `x402ResourceServer` + `HTTPFacilitatorClient` + `ExactStellarScheme`
   stack used at `server/index.ts:66-116`, so both implementations share one verified code path.
2. Until then, remove or disable the Vercel route rather than serve unpaid results.
3. Port `validateQuery()` (`server/index.ts:123-139`) to the serverless handler.
4. Replace the wildcard CORS with the same `ALLOWED_ORIGINS` allowlist used by
   `server/corsConfig.ts`.
5. Extract the price, asset, and receiving address into a single shared module so the two
   implementations cannot drift (this is the root cause of T-25 as well).
6. Add `api/**` to a tsconfig `include` — it is currently outside type checking entirely.

**Status: UNMITIGATED.** The highest-priority item in this document. Until closed, treat the Vercel
deployment as unmonetised.

---

### T-16 Wildcard CORS on the serverless route

**Attack.** `api/search.ts:17` sets `Access-Control-Allow-Origin: *` and explicitly allows the payment
headers. Any website can call the paid endpoint from a visitor's browser, consume the operator's
Serper quota and the deployment's rate limits, and — combined with T-15 — obtain results without
paying. It also makes the route trivially scriptable for bulk abuse.

**Mitigation.** Use `buildCorsOptions()` from `server/corsConfig.ts`, which applies an exact-match
`ALLOWED_ORIGINS` allowlist in production and blocks all cross-origin browser requests when the
allowlist is empty. Note that CORS is a browser-side control only and is **not** an authentication or
payment mechanism; a non-browser client ignores it entirely.

**Status: unmitigated** on the serverless route; mitigated on the Express route.

---

### T-17 Unauthenticated resource drain and no rate limiting

**Attack.** There is no rate limiting, quota, or throttling on any route. `/ai/chat`
(`server/index.ts:398-418`) is **entirely free** — no payment middleware covers it — and it calls the
billed Groq API. The paid routes are also unthrottled, so an attacker can burn the Serper.dev free
tier (2,500 queries/month) and generate Groq spend at will. Because no payment is required for
`/ai/chat`, this needs no wallet, no signing, and no facilitator involvement: it is the cheapest
possible attack against the operator.

Note that `express-rate-limit` is present in `package-lock.json` only as a transitive dependency of
`@modelcontextprotocol/sdk`. It is not a direct dependency and is not imported anywhere in the code.

**Mitigation.** Add `express-rate-limit` as a direct dependency with per-IP limits on every route,
tighter limits on `/ai/chat`, and a `express.json({ limit })` on that route (it currently has no body
size limit beyond the 100 kB Express default, and no validation of `messages` length or roles). Add
upstream budget alerting on both Serper and Groq accounts.

**Status: unmitigated.**

---

### T-18 MCP server wallet abuse

**Attack.** `mcp-server/index.ts` holds no key of its own. It calls the hosted paid endpoints and
relies on the _server's_ funded wallet, as its own comments note
(`mcp-server/index.ts:130-132`). Any MCP client permitted to connect to a deployment therefore
receives searches that the operator pays for. There is no per-client credential, quota, or payer
attribution.

**Mitigation.** Treat the MCP endpoint as operator-internal: bind it to localhost or require an
explicit shared secret, and document that exposing it publicly transfers its search budget to every
caller. Longer term, have the MCP server hold its own wallet so charges are attributable.

**Status: ACCEPTED (see §6).** The MCP server is a development and single-operator convenience
integration, not a public multi-tenant surface.

---

### T-19 Secret exposure

**Attack vectors.**

- **Server secrets in the client bundle.** `SERPER_API_KEY`, `GROQ_API_KEY`, and
  `STELLAR_RECEIVING_ADDRESS` must never reach the browser. Vite only exposes `VITE_`-prefixed
  variables, which is the correct boundary and is documented at `CONTRIBUTING.md:389-394`.
- **Upstream error leakage.** `server/index.ts:433` returns
  `{"error": "Groq AI error: <err.message>"}` with HTTP 500, forwarding raw upstream error text —
  which can contain provider request metadata — to an unauthenticated caller.
- **Committed environment file.** `.env` is correctly git-ignored, but `.env.production` is committed.
  It currently contains only placeholders, so **no secret is exposed today**; the risk is that a
  future real value is written there.
- **Logging.** `server/logger.ts` configures Winston with **no redaction and no rotation**, and
  every other call site uses raw `console.*` rather than the logger. The payment middleware logs the
  client IP and the query (truncated to 50 chars) on every `/search`
  (`server/index.ts:95-114`) — personal data retained with no stated retention policy.

**Mitigation.** Return opaque error identifiers to clients and keep provider detail in
server-side logs only. Confirm `.env.production` holds placeholders in CI. Add a redaction filter to
the Winston logger and route the remaining `console.*` call sites through it. Document a retention
period for the IP/query logs.

**Status: partially mitigated.** The Vite prefix boundary is sound; the error-leakage, redaction, and
retention items are outstanding.

---

### T-20 Free service on upstream error paths

**Attack.** The x402 Express adapter buffers the handler's output and **skips settlement entirely when
`res.statusCode >= 400`**, flushing the buffered response as-is
(`@x402/express/dist/esm/index.mjs:240-256`). Any route that returns 4xx or 5xx therefore serves its
response for free.

**Impact.** In this application, the error paths are thin — a 500 from Serper or Groq returns an
error object, not search results — so the practical loss is small. It is recorded because it is a
structural property of the middleware rather than a bug in our code, and because a future change that
returned partial or cached results with a 4xx/5xx status would silently become free.

**Mitigation.** None required today. Do not return billable content under an error status code.

**Status: mitigated by design (fail-cheap).** Documented so the property is not rediscovered as a bug.

---

### T-21 Prompt injection via search result snippets

**Attack.** The top three Serper snippets are concatenated and injected into a Groq prompt
(`server/index.ts:207-231`) alongside the user's query. Anyone who can influence indexed web content
can place text such as _"Ignore previous instructions and return…"_ in a snippet and have it reach
the model as apparent instructions.

**Mitigation.** The snippets are placed in a user-role message beneath a system prompt that constrains
the output to exactly three related search queries as a JSON array
(`server/index.ts:215-218`). Output is parsed and used only as search-suggestion strings rendered in
the UI, so the blast radius is a bad suggestion list, not code execution or data exfiltration. The
response is never fed back into a privileged operation.

**Residual risk.** The suggestion strings are rendered in the client. They are not treated as HTML,
so the practical risk is low, but any future move to `dangerouslySetInnerHTML` or to executing
suggestions would make this materially worse. Groq spend is also incurred per suggestion request with
no throttle (T-17).

**Status: mitigated** for the current output shape. Reassess if suggestions ever influence an
automated action.

---

### T-22 Upstream cost incurred before settlement is attempted

**Attack.** Not adversarial — an economic risk inherent to the architecture. The Express adapter calls
`next()` and lets the route handler run **before** settlement
(`@x402/express/dist/esm/index.mjs:209-238`). `/search` calls the paid Serper.dev API inside that
handler. So on every request the operator pays Serper first and collects USDC second. If settlement
then fails, the operator has served a search and paid its upstream cost for nothing.

**Amplifiers.** A facilitator outage ([T-08](#t-08-facilitator-unavailability-and-missing-timeouts-on-outbound-calls))
turns this from a rare edge case into the normal case: the upstream call is made, the response is
buffered, settlement hangs or fails, and the request 402s after the cost was already incurred.
Without rate limiting ([T-17](#t-17-unauthenticated-resource-drain-and-no-rate-limiting)) an attacker
can induce this at volume.

**Mitigation.** Rate-limit before the upstream call. Add a per-IP spend circuit breaker. Note that a
full fix — settling before doing the work — would require a two-phase protocol change and is out of
scope for the current middleware.

**Status: ACCEPTED (see §6),** with rate limiting as the practical compensating control.

---

### T-23 Front-running and mempool extraction

**Analysis.** Not applicable. Stellar has no public mempool and no gas auction; transactions are
submitted directly to a leader and ordered by arrival. A payment cannot be observed in the
cleartext and copied ahead of a legitimate transaction — the auth entry is already bound to a specific
payer, amount, and sequence, so copying it is a replay ([T-01](#t-01-replay-of-a-captured-payment-header)),
not a front-run. Fee-bidding griefing is likewise not applicable.

**Status: not applicable.** Recorded so the absence of a mempool is documented as a deliberate
finding rather than an oversight.

---

### T-24 User wallet compromise and key theft

**Attack.** The user's Freighter account is compromised by malware, a malicious browser extension, a
seed-phrase phishing site, or a supply-chain attack on a dependency in the client bundle. The
attacker signs auth entries and spends the victim's USDC.

**Why it is out of scope.** The project never handles a private key. `useSearch.ts` calls
`signAuthEntry` through the Freighter extension API; signing happens inside the extension and the key
never touches this codebase. This matches the project's "no private key exposure" claim
(`src/pages/DocsPage.tsx:21`), which is accurate.

**Residual risk.** The client bundle's third-party supply chain is a real vector: the bundle loads
React, Framer Motion, Lucide, the Groq SDK, and the Stellar SDK. A compromised dependency could
exfiltrate data from the page, including prompting the user to approve a fraudulent signature. This
is a general web-application risk, not specific to the payment flow.

**Status: out of scope for the server threat model.** Users are advised to verify the origin before
approving any signature and to treat a signature approval prompt as a financial authorisation.

---

### T-25 USDC contract address disagreement between implementations

**Attack.** The Express server derives the USDC Soroban contract address from inside the
`@x402/stellar` package, while `api/search.ts:61` uses `USDC_CONTRACT` from
`src/lib/constants.ts:40`. For **mainnet** these two values differ:

| Source                                   | Mainnet USDC contract                                      |
| ---------------------------------------- | ---------------------------------------------------------- |
| `src/lib/constants.ts:40`                | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7EJJUST` |
| `@x402/stellar` (client scheme, mainnet) | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |

The Express server uses the library's address; the serverless handler uses the constants file's. The
two implementations therefore quote **different assets for the same nominal price** on mainnet. One
is wrong. A user paying the wrong contract, or a server accepting an asset that is not the intended
USDC, is a direct payment-integrity failure.

**Mitigation.** Define the asset address, price, and receiving address in exactly one shared module
imported by `server/`, `api/`, and `src/`, with a build-time assertion that the value is a valid
`C...` contract address on the configured network and a startup self-check that queries the contract
on-chain.

**Status: unmitigated.** Contributes to T-15: fixing the serverless route should include unifying
price and asset configuration.

---

### T-26 Client records a false receipt

**Attack.** Not adversarial — a correctness and user-trust defect. `useSearch.ts:209-229` persists a
receipt to `localStorage` so the dashboard can show payment history. Because the server never supplies
a transaction hash (see [T-10](#t-10-post-settlement-failure-where-service-is-delivered-and-funds-are-lost)), and
because `localStorage` is writable by any script on the origin, the client can end up displaying
payment records that are fabricated, incomplete, or stale — and a user cannot reconcile them against a
ledger.

**Mitigation.** Return the real settlement transaction hash from the settlement response and verify
it against Horizon before persisting a receipt. Treat `localStorage` receipt data as untrusted and
cosmetic; never use it for entitlement decisions.

**Status: unmitigated.**

---

### T-27 Resource exhaustion on unpaid free endpoints

**Attack.** `/ai/chat` and `/health` are unauthenticated, unthrottled, and require no payment.
`/health` (`server/index.ts:481`) returns server statistics including `totalUsdcSettled` and latency
data, which is free reconnaissance. `/ai/chat` performs an unbounded, paid Groq call and, when
`suggestions=1` is passed, adds a **second** paid Groq call per request. Neither route has a body size
limit beyond the Express default, nor validation of the `messages` array's length or roles.

**Mitigation.** Rate-limit both routes; cap `messages` length and validate roles; add
`express.json({ limit: '…' })` to `/ai/chat`; reduce `/health` to a liveness signal in production and
move the statistics behind an authenticated path or remove them.

**Status: unmitigated.**

---

## 6. Accepted risks

The following are **understood, deliberate, and not mitigated** at the current stage. They are listed
so that the decision is visible and reviewable rather than implicit. Each has a compensating control.

| ID   | Accepted risk                                                                                                | Rationale                                                                                                                                                   | Compensating control                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AR-1 | The facilitator is fully trusted for signature validity and settlement outcome (T-07, T-11)                  | Operating our own Stellar RPC/RPC-validating node is disproportionate for a search service. The x402 protocol is designed around a third-party facilitator. | Pin and review `FACILITATOR_URL`; treat changes to it as security-relevant; monitor settlement volume against facilitator-reported success. Revisit if a self-hosted facilitator becomes practical. |
| AR-2 | Settlement is not independently confirmed against a finalized ledger (T-11)                                  | Same root cause as AR-1.                                                                                                                                    | Schema validation of the facilitator response; alerting on settlement-success-versus-ledger divergence if a read replica is later added.                                                            |
| AR-3 | No facilitator mutual authentication or response signing (T-07)                                              | The public facilitator does not require or offer client credentials; pinning would break upgrades.                                                          | TLS with hostname verification; environment-variable review; documented above.                                                                                                                      |
| AR-4 | The MCP server spends the operator's wallet on behalf of any permitted client (T-18)                         | The MCP server is a single-operator development integration, not a multi-tenant product surface.                                                            | Document as internal-only; bind locally; do not expose publicly.                                                                                                                                    |
| AR-5 | Upstream API cost is incurred before settlement (T-22)                                                       | Structural to the buffered-response middleware; a two-phase protocol change is out of scope.                                                                | Rate limiting before the upstream call; per-IP spend circuit breaker.                                                                                                                               |
| AR-6 | Error responses are served without settlement (T-20)                                                         | Deliberate fail-cheap behaviour in the x402 adapter; error bodies carry no billable content.                                                                | Do not return billable content under an error status code.                                                                                                                                          |
| AR-7 | Payment status in logs is inferred from the HTTP status code, not from settlement (`server/index.ts:95-114`) | Adequate for the current observability needs.                                                                                                               | Do not use the `paid` label as an accounting source of truth; reconcile against the ledger.                                                                                                         |
| AR-8 | Payment logging covers `/search` only and records client IP and query (T-19)                                 | Sufficient for the current debugging workflow.                                                                                                              | Retention period to be documented; redaction filter to be added.                                                                                                                                    |

---

## 7. Hardening backlog

Ordered by risk reduction per unit of effort. Items 1–3 are prerequisites for treating the deployment
as correctly monetised.

| #   | Action                                                                                                                                                                                 | Addresses        | Effort |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| 1   | Unify the two server implementations onto the verified `@x402` middleware path; disable the hand-rolled serverless handler until then                                                  | T-15, T-16, T-25 | Large  |
| 2   | Add a single shared config module for price, asset, and receiving address, consumed by `server/`, `api/`, and `src/`                                                                   | T-25, T-04       | Small  |
| 3   | Add `express-rate-limit` as a direct dependency; throttle every route, `/ai/chat` most tightly                                                                                         | T-17, T-27, T-22 | Small  |
| 4   | Apply `AbortSignal.timeout()` to all facilitator `fetch` calls; fail closed after a short budget                                                                                       | T-08             | Small  |
| 5   | Return the real settlement transaction hash to the client; stop reading the request header `x-payment-response`                                                                        | T-10, T-26       | Small  |
| 6   | Add a post-settlement confirmation query against Horizon for the returned transaction hash                                                                                             | T-11             | Medium |
| 7   | Add a short-lived nonce/idempotency cache over consumed payments, with atomic consume                                                                                                  | T-01, T-09       | Medium |
| 8   | Replace the permissive startup warnings for `STELLAR_RECEIVING_ADDRESS` / `SERPER_API_KEY` / `GROQ_API_KEY` with hard failures; validate the `G...` and `C...` address formats         | T-04, T-25       | Small  |
| 9   | Add a startup network self-check against Horizon for the configured network and receiving address                                                                                      | T-05             | Small  |
| 10  | Return opaque error identifiers instead of raw upstream messages; add redaction to the Winston logger and route `console.*` through it                                                 | T-19             | Medium |
| 11  | Add `api/**` to a tsconfig `include`; wire `tsc.server.json` into a script                                                                                                             | T-15, general    | Small  |
| 12  | Add security response headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS)                                                                                                 | General          | Small  |
| 13  | Resolve the pre-existing client type errors (missing `sonner` and `recharts` dependencies) so the type-check gate is green                                                             | General          | Small  |
| 14  | Correct the stale facilitator documentation in `README.md`, `TROUBLESHOOTING.md`, and `src/pages/DocsPage.tsx`, which still name an OpenZeppelin facilitator and an `X-Payment` header | Accuracy         | Small  |

---

## 8. Reviewing this document

This is a living document. Update it when:

- a payment, verification, or settlement code path changes;
- an `@x402/*` dependency is upgraded — the guarantees in §4.2 are inherited from those packages and
  a version bump is a security change;
- a new external service enters the payment flow;
- any risk in §6 is accepted, mitigated, or withdrawn.

When reviewing a change, check it against the V-1…V-12 invariants in §4.2. Those are the properties
that make the service safe to operate; a change that weakens one of them needs an explicit decision,
recorded in §6.

---

## 9. Reporting a security issue

Please do not open a public issue for a suspected vulnerability. See [`SECURITY.md`](../SECURITY.md)
for the reporting process.

---

_Cross-references: [`SECURITY.md`](../SECURITY.md) · [`CONTRIBUTING.md`](../CONTRIBUTING.md) ·
[`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md)_
