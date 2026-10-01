# Security Policy

StellarSearch is a pay-per-query search service that settles payments on the Stellar network via the
[x402](https://x402.org) protocol. Because payment **is** authentication in this system — there are no
user accounts, sessions, or API keys — the security of the payment flow is the security of the
product. This document is the entry point for how we handle security; the detailed analysis lives in
a dedicated threat model.

---

## Payment Flow Threat Model

> **[`docs/threat-model.md`](docs/threat-model.md)**
>
> Read this before deploying, reviewing a payment-related pull request, or changing any `@x402/*`
> dependency.

The threat model documents the trust boundaries between the **client**, the **backend server**, the
**payment facilitator**, and the **Stellar network**; specifies what each party is trusted for versus
what the server must verify independently; and enumerates 27 concrete attack scenarios with their
mitigations or explicitly accepted risks.

| Section | Contents |
| --- | --- |
| [§2 — System overview](docs/threat-model.md#2-system-overview) | Actors, the payment flow, and the **two divergent server implementations** |
| [§3 — Trust boundaries](docs/threat-model.md#3-trust-boundaries) | TB-1 client ↔ backend, TB-2 upstream providers, TB-3 backend ↔ facilitator, TB-4 facilitator ↔ Stellar |
| [§4 — Party trust matrix](docs/threat-model.md#4-party-trust-and-verification-matrix) | What each party is trusted for, and the **V-1…V-12** invariants the server must enforce |
| [§5 — Attack enumeration](docs/threat-model.md#5-attack-enumeration-and-mitigations) | Replay, amount tampering, race conditions, post-settlement failure, and 23 more |
| [§6 — Accepted risks](docs/threat-model.md#6-accepted-risks) | Deliberately unmitigated risks (AR-1…AR-8) and their compensating controls |
| [§7 — Hardening backlog](docs/threat-model.md#7-hardening-backlog) | Prioritised remediation items |

### Current posture — summary

The highest-severity findings are recorded in the threat model. In brief:

| ID | Finding | Severity | Status |
| --- | --- | --- | --- |
| [T-15](docs/threat-model.md#t-15-serverless-route-bypasses-payment-verification-entirely) | The Vercel handler `api/search.ts` checks only that a payment header is *present* — no signature, amount, asset, or settlement verification | **Critical** | **Unmitigated** |
| [T-07](docs/threat-model.md#t-07-compromised-or-intercepted-facilitator-accepts-forged-payments) | The facilitator is the sole verification and settlement authority, reached with no mutual authentication | **Critical** | Accepted ([AR-1](docs/threat-model.md#6-accepted-risks)) |
| [T-11](docs/threat-model.md#t-11-facilitator-reports-success-for-a-transaction-that-never-settled) | Settlement success is taken on trust and never confirmed against a finalized ledger | **Critical** | Accepted ([AR-2](docs/threat-model.md#6-accepted-risks)) |
| [T-16](docs/threat-model.md#t-16-wildcard-cors-on-the-serverless-route) | Hard-coded `Access-Control-Allow-Origin: *` on the serverless route | High | Unmitigated |
| [T-17](docs/threat-model.md#t-17-unauthenticated-resource-drain-and-no-rate-limiting) | No rate limiting on any route; `/ai/chat` is free and calls the billed Groq API | High | Unmitigated |
| [T-25](docs/threat-model.md#t-25-usdc-contract-address-disagreement-between-implementations) | The two implementations quote different USDC contract addresses on mainnet | Medium | Unmitigated |

> **Deployment note.** `server/index.ts` (Express) enforces payment via the `@x402` middleware.
> `api/search.ts` (Vercel) does not. Until [T-15](docs/threat-model.md#t-15-serverless-route-bypasses-payment-verification-entirely)
> is resolved, the Vercel deployment should be treated as **unmonetised** and not exposed to
> untrusted traffic.

---

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security vulnerability.**

Report it privately via GitHub's security advisory form:

1. Go to **Security** → **Advisories** → **Report a vulnerability** on this repository.
2. Include: affected component (`server/`, `api/`, `src/`, `mcp-server/`), a description of the issue,
   reproduction steps, and any impact assessment you have made.
3. You will receive an acknowledgement, and we will keep you updated as the issue is resolved.

If private reporting is unavailable to you, open an issue that contains **only** a pointer asking the
maintainers to contact you privately — no technical detail.

### What we ask of reporters

- Give us a reasonable window to ship a fix before public disclosure. We aim to acknowledge reports
  within 3 business days.
- Avoid accessing data that does not belong to you, and avoid sustained denial-of-service testing
  against the public endpoints.
- Reports of payment-integrity issues — anything that lets a client obtain a paid resource without a
  settled payment — are treated as **Critical** and prioritised accordingly.

### Scope

In scope: the payment and verification flow, the facilitator integration, secret handling, the input
validation on paid routes, and the serverless handlers.

Out of scope: the security of the Stellar network, Soroban, or the x402 specification; vulnerabilities
in Serper.dev, Groq, or the Freighter extension; attacks requiring a compromised developer machine;
and reports from automated scanners without a demonstrated impact against this codebase.

---

## Secure development guidelines

These supplement [`CONTRIBUTING.md`](CONTRIBUTING.md); they do not replace it.

### Secrets

- Never commit real secrets. `.env` is in `.gitignore` — keep it that way. **`.env.production` is
  committed**; it must contain placeholders only.
- Server secrets (`SERPER_API_KEY`, `GROQ_API_KEY`, `STELLAR_RECEIVING_ADDRESS`) belong in `.env`,
  read via `process.env`, and must never be imported from `src/`.
- Frontend variables must be prefixed `VITE_` to reach the browser. Anything `VITE_`-prefixed is
  public — do not put a secret behind that prefix.
- When adding an environment variable, add it to [`.env.example`](.env.example) with a descriptive
  comment and a placeholder value.

### Payment-flow changes

- Any change touching `server/index.ts:66-116`, `api/search.ts`, or the `@x402/*` packages is a
  **security-sensitive change**. Check it against the V-1…V-12 invariants in
  [§4 of the threat model](docs/threat-model.md#4-party-trust-and-verification-matrix) and update the
  threat model in the same pull request.
- Never let the client-supplied price, asset, or `payTo` reach a code path without being compared
  against a server-computed value.
- Never introduce a `Settlement-Overrides` header derived from client input — see
  [T-12](docs/threat-model.md#t-12-settlement-overrides-header-abuse).
- Upgrading `@x402/*` is a security change: the guarantees in §4.2 of the threat model are inherited
  from those packages, not implemented in this repository.

### Input handling

- Validate and bound all client input. `validateQuery()` in `server/index.ts:123-139` is the
  reference implementation: length cap, control-character stripping, and clamped numeric parameters.
- Do not return raw upstream provider error messages to clients
  ([T-19](docs/threat-model.md#t-19-secret-exposure)).
- Use the `logger` from `server/logger.ts` rather than `console.*`, and never log secrets,
  authorization headers, or full payment payloads.

### Before opening a pull request

- [ ] `npx tsc --noEmit` passes
- [ ] No secrets, `.env` values, or real keys in the diff
- [ ] No new `console.log` / debug statements
- [ ] Threat model updated if the change affects a trust boundary, an invariant, or an accepted risk

---

## Related documentation

| Document | Purpose |
| --- | --- |
| [`docs/threat-model.md`](docs/threat-model.md) | Payment flow threat model — trust boundaries, invariants, attacks |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Architecture, boundaries, workflow, and code style |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Payment-header format spec and common failure modes |
| [`README.md`](README.md) | Setup, architecture overview, and the payment flow |
| [`.env.example`](.env.example) | Documented environment variables |
