# 0001. x402 Express middleware: `paymentMiddlewareFromConfig`

- **Status:** Accepted
- **Date:** 2026-04-12
- **Deciders:** @maintainers

## Context

The Express server (`server/index.ts`) needs to return HTTP 402 with payment
requirements on paid routes (`/search`, `/images`, `/news`) and settle those payments
on Stellar through a facilitator.

The `@x402/express` package exposes two APIs that look interchangeable:

- `paymentMiddleware(routes, facilitator, ...)` — the generic/Core HTTP-402 API
  (originally designed around EVM chains).
- `paymentMiddlewareFromConfig(routes, facilitatorClient, schemes)` — the Stellar-aware
  variant, where the per-network `ExactStellarScheme` server implementation is
  registered explicitly via the `schemes` array.

The original Stellar x402 quickstart and the `x402-stellar` repo both use
`paymentMiddlewareFromConfig`. The older `paymentMiddleware` shape was the source of
subtle breakage during initial bring-up: without the explicit scheme registration,
the middleware could not correctly build Stellar payment requirements, and the 402
loop never resolved.

Relevant code today:

- `server/index.ts` — imports and applies `paymentMiddlewareFromConfig`
  (`app.use(paymentMiddlewareFromConfig(x402Routes, facilitatorClient, schemes))`).
- Schemes are wired with `{ network: NETWORK, server: new ExactStellarScheme() }`.
- Settlement goes through `HTTPFacilitatorClient` pointed at the public x402.org
  facilitator (no API key needed on testnet).

## Decision

Use **`paymentMiddlewareFromConfig`** from `@x402/express` with an explicit schemes
array (`ExactStellarScheme` from `@x402/stellar/exact/server`) and an
`HTTPFacilitatorClient` from `@x402/core/server`. Do **not** use the generic
`paymentMiddleware` factory.

## Alternatives considered

- **`paymentMiddleware(...)` (generic factory)** — shorter call site, but it infers
  scheme/network handling internally and was built for the EVM default path. On
  Stellar it did not wire `ExactStellarScheme` correctly, producing payment
  requirements the client could not parse ("Failed to parse payment requirements" —
  see TROUBLESHOOTING.md). Rejected: it fights the library's Stellar path.
- **Hand-rolled 402 middleware** — full control over the 402 header format and
  settlement, but re-implements protocol logic (envelope encoding, header parsing,
  verification, settlement) that x402 already owns, with real money on the line.
  Rejected: high blast radius, high maintenance.

## Consequences

- **Easier:** upgrades track the official Stellar docs verbatim; the scheme registry
  is explicit, so adding a second payment scheme later is a config change.
- **Harder:** every route that needs payment must be declared in the `x402Routes`
  object — there is no "protect everything" default. Forgetting a route means it is
  silently free.
- **Revisit when:** `@x402/express` deprecates `paymentMiddlewareFromConfig`, or when
  we need a scheme/network combination the config API does not support.

## References

- Official Stellar x402 quickstart and the `x402-stellar` repo (both use
  `paymentMiddlewareFromConfig`).
- `server/index.ts` header comment ("Uses the CORRECT API per official Stellar x402
  quickstart").
- [x402 docs](https://x402.org) and the
  [Stellar agentic payments guide](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar).
- `TROUBLESHOOTING.md` — "Failed to parse payment requirements" row.
