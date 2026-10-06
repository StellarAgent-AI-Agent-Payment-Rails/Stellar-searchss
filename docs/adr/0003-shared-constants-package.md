# 0003. Shared constants module across frontend and Node

- **Status:** Accepted
- **Date:** 2026-04-12
- **Deciders:** @maintainers

## Context

StellarSearch has two runtimes that need _identical_ network facts:

- **`src/`** — React app in the browser, built by Vite. Env vars come from
  `import.meta.env` and must be prefixed `VITE_`.
- **`server/`** — Express in Node. Env vars come from `process.env`, no prefix.

Both sides need the same values: network identifier (`stellar:testnet` vs
`stellar:mainnet`), Horizon URL, USDC issuer and Soroban contract addresses, and the
payment amount. If these drift, the failure modes are nasty and silent — the client
signs for `USDC@testnet` while the server expects mainnet, or amounts mismatch and
settlement fails mid-flow. A duplicated constants file _will_ drift eventually,
usually right after someone updates one side only.

`src/lib/constants.ts` is therefore imported by both the frontend (via
`src/lib/stellar.ts` and hooks) **and** by `server/index.ts`. This crosses the
"browser vs Node" boundary that `CONTRIBUTING.md` warns about — and that is
deliberate, because this one file contains no secrets and no runtime-specific code.

To make one source of truth work in both runtimes, the module resolves env vars with
a dual-runtime `getEnv()` helper: it checks `process.env` first, then
`import.meta.env` with the `VITE_` prefix, then falls back to a hardcoded default.

## Decision

Keep a **single shared constants module** (`src/lib/constants.ts`) imported by both
frontend and server code, with the dual-runtime `getEnv()` resolution helper inside
it. Hard constraints that make this safe:

- The module may contain **no secrets** and **no server-only imports**.
- Every value must be either a public constant (URLs, addresses) or a value with a
  safe fallback (`stellar:testnet`).
- Secrets stay in `server/` and are read via `process.env` there — never through
  this module.

## Alternatives considered

- **Duplicate constants files (`src/lib/constants.ts` + `server/constants.ts`)** —
  clean runtime separation, no shared-boundary rules to enforce. Rejected: the whole
  point is that drift between the two is the bug we are preventing; duplication
  guarantees eventual drift.
- **Build-time injection only (Vite `define`)** — one env mechanism, tree-shaken.
  Rejected: the server is plain `tsx`/Node, not a Vite build, so we would need a
  second injection pipeline anyway — recreating the dual-runtime problem elsewhere.
- **Publish an internal workspace package (e.g. `@stellarsearch/shared`)** — the
  "proper" long-term shape with explicit dependency boundaries. Rejected for now:
  overhead of a workspace setup outweighs one small module; revisit if the shared
  surface grows beyond constants.

## Consequences

- **Easier:** changing a USDC contract address or adding mainnet support is a
  one-file edit; the client and server can never disagree about network facts.
- **Harder:** the file is a load-bearing boundary exception. Reviewers must reject
  any PR that adds a secret or a Node-only import to it. The `@ts-ignore`s inside
  `getEnv()` are there because `import.meta` is not in the server tsconfig — again
  intentional, do not "fix" them by importing Vite types into the server build.
- **Accepted tradeoff:** env resolution order is `process.env` → `import.meta.env`
  → hardcoded default. On the server, `VITE_*`-prefixed vars in `.env` are ignored
  by this helper (it reads the unprefixed name first), so server config always wins
  in development.
- **Revisit when:** shared surface grows past constants (move to a workspace
  package), or when the server moves into a Vite-based build (collapse `getEnv()`).

## References

- `src/lib/constants.ts` — header comment: "Centralized Stellar network constants
  for both Frontend and Backend."
- `server/index.ts` — imports `STELLAR_NETWORK`, `HORIZON_URL`, `AMOUNT_USDC`,
  `AMOUNT_STROOPS` from `../src/lib/constants`.
- `CONTRIBUTING.md` — "Key boundaries to understand" (the boundary this file
  deliberately crosses) and the Environment variables section.
