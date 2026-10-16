# Changelog

All notable changes to StellarSearch are documented here.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Releases are tagged `vMAJOR.MINOR.PATCH` on the `main` branch and a GitHub
Release with these notes is created automatically by the release workflow.

---

## What constitutes a breaking change?

A **breaking change** (major version bump) is anything that requires callers to
update their integration:

- Removing or renaming an existing endpoint (`GET /search`, `GET /images`,
  `GET /news`, `POST /ai/chat`, `GET /health`).
- Removing or renaming a field in a JSON response body that was previously
  documented as stable.
- Changing the payment amount or currency accepted by the x402 middleware.
- Changing the required request parameters of any endpoint.
- Dropping support for a previously supported x402 scheme or network.

A **minor change** adds new endpoints, new optional response fields, or new
optional request parameters without altering existing behaviour.

A **patch change** is a bug fix, security patch, documentation update, or
internal refactor that does not affect the public API surface.

---

## MCP Server versioning

The MCP server (`mcp-server/`) is part of the same npm package and shares the
version number defined in `package.json`. It does **not** version independently.
If a future need arises to decouple it (e.g., publishing it as a separate
package), that decision will be noted here and a new section added.

---

## [Unreleased]

### Fixed

- Dashboard USDC charts now distinguish loading, no activity, and failed requests,
  with a retry action instead of disappearing when there is nothing to plot
  ([#71](../../issues/71)).

---

## [1.1.0] — 2026-09-30

### Added

- **Semantic versioning & release process** (resolves [#156](../../issues/156))
  - `CHANGELOG.md` (this file) documents all notable changes going forward.
  - `.github/workflows/release.yml` — push a `v*` tag to trigger an automatic
    GitHub Release with generated notes.
  - `GET /health` and `GET /` now return a `version` field so the running API
    version is always discoverable without inspecting source code.
  - `GET /health` (Vercel / `api/health.ts`) also returns `version`.
  - The UI footer displays the current version sourced from `package.json` via
    the Vite `define` build config.
  - MCP server version updated to match `package.json`.

---

## [1.0.0] — 2026-09-01

### Added

- Initial release of StellarSearch.
- Pay-per-query web search API backed by Serper.dev and settled via x402 on
  Stellar Testnet (0.001 USDC per query).
- `GET /search` — web search with optional AI query suggestions (Groq).
- `GET /images` — image search.
- `GET /news` — news search.
- `POST /ai/chat` — Groq AI chat (streaming SSE + JSON fallback).
- `GET /health` — live server stats.
- React 18 frontend with Freighter wallet integration, live Horizon balance,
  payment flow visualiser, and Groq AI assistant panel.
- MCP server exposing `web_search`, `image_search`, `ai_summarize`, and
  `check_balance` tools for Claude Code / MCP clients.
- Structured payment-attempt logging via Winston.
- End-to-end test script (`npm run test:search`).
