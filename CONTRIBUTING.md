# Contributing to StellarSearch

Thank you for taking the time to contribute! StellarSearch is an open-source, pay-per-query web search API built on the Stellar blockchain using the x402 payment protocol. Every improvement — from a one-line typo fix to a full feature implementation — is welcome.

This document covers everything you need to go from zero to a merged pull request.

---

## ⚡ First 15 minutes

Want to see the app running and change something you can look at? Follow this section only — it is the shortest path from clone to a visible change. **No wallet, no testnet account, no blockchain knowledge required.**

Everything after this section is reference material for when you need it.

### 1. Clone and install (~4 min)

```bash
# Fork the repo on GitHub first, then clone your fork:
git clone https://github.com/<your-username>/Stellar-searchss.git
cd Stellar-searchss        # note: the directory is Stellar-searchss, not stellar-search
npm install          # Node 18+ and npm 9+ required
```

### 2. Add two free API keys (~4 min)

```bash
cp .env.example .env
```

Open `.env` and set **only these two** values:

| Key              | Where to get it                                        | Cost                       |
| ---------------- | ------------------------------------------------------ | -------------------------- |
| `SERPER_API_KEY` | [serper.dev](https://serper.dev)                       | Free — 2,500 queries/month |
| `GROQ_API_KEY`   | [console.groq.com/keys](https://console.groq.com/keys) | Free                       |

Leave every other value in `.env` exactly as it is. `STELLAR_RECEIVING_ADDRESS` can stay as the placeholder and the server will still boot — it only matters for the paid `/search` route (see step 5).

### 3. Run it (~2 min)

```bash
npm run dev:all      # starts the Express backend (:3001) and Vite frontend (:5173)
```

Open **http://localhost:5173**. You should see the landing page, navbar, footer and the stats grid. The floating Groq assistant works too, because it only needs `GROQ_API_KEY`.

> Prefer two terminals? Run `npm run server` and `npm run dev` side by side. (`npm run setup` does steps 1 and 2 for you if you would rather run one command.)

### 4. Make a visible change (~3 min)

Pick any file under `src/` and edit it — Vite hot-reloads instantly, so you get feedback in the browser without restarting anything.

```
src/components/layout/Footer.tsx   # change the tagline text
src/components/layout/Navbar.tsx   # tweak a link label or spacing
src/pages/DocsPage.tsx             # fix wording in the docs copy
```

That is a real, PR-able contribution. Confirm it still typechecks before opening a PR:

```bash
npx tsc --noEmit
```

### 5. What you can (and cannot) do without a wallet

| ✅ Works with no wallet                                                 | ⛔ Needs Freighter + funded testnet USDC                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Everything in `src/` — pages, components, styling, copy, layout         | `/search` (the 0.001 USDC paid route) and anything that calls it                                     |
| `npm run setup`, `npm run dev`, `npm run build`, `npx tsc --noEmit`     | `src/hooks/useSearch.ts`, `src/hooks/useFreighterWallet.ts`, `src/components/wallet/WalletPanel.tsx` |
| `npm run test:search` — it signs no payment, it asserts the `402`       | MCP tools — `web_search` pays via x402                                                               |
| `GET /health`, `GET /ai/chat`, docs, README, CONTRIBUTING, issue triage | `src/pages/DashboardPage.tsx` (reads live Horizon tx history)                                        |

If your change never touches the payment flow, you never need to install Freighter or create a Stellar account. The full wallet walkthrough is in [Local Development Setup](#local-development-setup).

### 6. Find something to work on

- **[Good first issues](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/issues?q=is%3Aopen+label%3A%22good+first+issue%22)** — scoped, self-contained, with clear acceptance criteria.
- [All open issues](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/issues) — the backlog has 50+ scoped ideas.
- New to Stellar or x402? Start with the [Stellar and x402 glossary](docs/glossary.md).
- Comment _"I'd like to work on this"_ on the issue before you start, so two people do not build the same thing.

Then branch, commit and open a PR — the conventions are in [Development Workflow](#development-workflow) and [Submitting a Pull Request](#submitting-a-pull-request).

---

## Table of Contents

1. [First 15 minutes](#first-15-minutes)
2. [Code of Conduct](#code-of-conduct)
3. [Project Overview](#project-overview)
4. [Prerequisites](#prerequisites)
5. [Local Development Setup](#local-development-setup)
6. [Project Structure](#project-structure)
7. [Development Workflow](#development-workflow)
8. [Submitting a Pull Request](#submitting-a-pull-request)
9. [Issue Guidelines](#issue-guidelines)
10. [Coding Standards](#coding-standards)
11. [Testing](#testing)
12. [Common Pitfalls](#common-pitfalls)
13. [Getting Help](#getting-help)
14. [Changelog & Releases](#changelog--releases)

---

## Code of Conduct

By participating in this project you agree to treat all contributors with respect. Harassment, discrimination, or hostile behaviour of any kind will not be tolerated. Be constructive, be kind, assume good intent.

---

## Project Overview

```
Browser (Freighter wallet)
    │
    │  1. GET /search?q=...
    ▼
Express Server  ──── @x402/express middleware ────►  HTTP 402 + payment requirements
    │                                                        │
    │  3. Retry with X-Payment header                        │ 2. User signs via Freighter
    ▼                                                        ▼
x402 Facilitator (x402.org)  ──── verify + settle ────►  Stellar Testnet (0.001 USDC)
    │
    ▼
Serper.dev  ──── real Google results ────►  Browser
```

**Core packages:**

| Package                  | Role                            |
| ------------------------ | ------------------------------- |
| `@x402/express`          | HTTP 402 payment middleware     |
| `@x402/stellar`          | Stellar-specific x402 scheme    |
| `@x402/fetch`            | Client-side x402 fetch wrapper  |
| `@stellar/freighter-api` | Browser wallet signing          |
| `@stellar/stellar-sdk`   | Horizon API client              |
| `groq-sdk`               | Groq AI (Llama 3.3 70B)         |
| `serper.dev`             | Real-time Google search results |

---

## Prerequisites

Before you begin, make sure you have:

| Requirement                 | Version    | Notes                                                    |
| --------------------------- | ---------- | -------------------------------------------------------- |
| **Node.js**                 | ≥ 18.0.0   | ESM support required                                     |
| **npm**                     | ≥ 9.0.0    | Comes with Node 18                                       |
| **Git**                     | any recent | —                                                        |
| **Freighter**               | latest     | [freighter.app](https://freighter.app) browser extension |
| **Stellar testnet account** | —          | Free — see setup below                                   |

### Free API keys you will need

| Key                         | Where to get it                                        | Cost                       |
| --------------------------- | ------------------------------------------------------ | -------------------------- |
| `SERPER_API_KEY`            | [serper.dev](https://serper.dev)                       | Free — 2,500 queries/month |
| `GROQ_API_KEY`              | [console.groq.com/keys](https://console.groq.com/keys) | Free                       |
| `STELLAR_RECEIVING_ADDRESS` | [Stellar Lab](https://lab.stellar.org/account/fund)    | Free testnet keypair       |

> **Note:** You only need `SERPER_API_KEY` and `GROQ_API_KEY` for most frontend work. The `STELLAR_RECEIVING_ADDRESS` is only required if you are working on the payment flow.

---

## Local Development Setup

### 1. Fork and clone

```bash
# Fork the repository on GitHub first, then clone it:
git clone https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss.git
cd Stellar-searchss
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# Required for search to work
SERPER_API_KEY=your_serper_api_key_here
GROQ_API_KEY=gsk_your_groq_key_here

# Required for x402 payment flow (official x402.org facilitator — no facilitator API key required)
STELLAR_RECEIVING_ADDRESS=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
STELLAR_NETWORK=stellar:testnet
VITE_STELLAR_NETWORK=stellar:testnet
FACILITATOR_URL=https://www.x402.org/facilitator

# Server
PORT=3001

# Frontend — points the React app at your local backend
VITE_SERVER_URL=http://localhost:3001
```

### 4. Set up Freighter (for payment flow work)

1. Install [Freighter](https://freighter.app) browser extension.
2. Create a new wallet (or import one).
3. Switch to **Testnet**: Settings → Network → Testnet.
4. Get a funded testnet account at [Stellar Lab](https://lab.stellar.org/account/fund).
5. Add the USDC trustline and claim testnet USDC from the [Circle faucet](https://faucet.circle.com) — the full walkthrough is the [Get testnet USDC](README.md#get-testnet-usdc) section of the README.

> If you are **not** working on the wallet or payment flow, you can skip step 4 entirely — the frontend works without a wallet for most UI changes.

### 5. Start the development servers

```bash
# Terminal 1 — Express backend (port 3001)
npm run server

# Terminal 2 — Vite frontend (port 5173)
npm run dev
```

Both can also be started together with:

```bash
npm run dev:all
```

Open `http://localhost:5173` in your browser.

### 6. Verify everything works

```bash
# Health check — should return { "status": "ok", ... }
curl http://localhost:3001/health | jq .

# Checks the x402 gate on /search (needs the server running, no wallet needed)
npm run test:search "Stellar blockchain"
```

---

## Project Structure

```
Stellar-searchss/
│
├── src/                        # React 18 frontend (TypeScript)
│   ├── components/
│   │   ├── ai/                 # GroqAssistant floating panel
│   │   ├── layout/             # Navbar, Footer, LiveTicker, AnimatedBackground
│   │   ├── search/             # SearchBar, SearchResults, PaymentFlowVisualizer
│   │   ├── ui/                 # StatsGrid and shared UI pieces
│   │   └── wallet/             # WalletPanel
│   ├── hooks/
│   │   ├── useFreighterWallet.ts   # Freighter connect + live Horizon balances
│   │   └── useSearch.ts            # x402 payment flow + search logic
│   ├── lib/
│   │   └── stellar.ts          # Horizon helpers / constants
│   ├── pages/
│   │   ├── SearchPage.tsx
│   │   ├── DashboardPage.tsx   # Live tx history from Horizon
│   │   └── DocsPage.tsx
│   └── types/
│       └── index.ts            # Shared TypeScript types
│
├── server/
│   └── index.ts                # Express server — x402 middleware, Serper, Groq AI
│
├── api/                        # Vercel serverless function equivalents
│   ├── search.ts
│   ├── health.ts
│   └── ai/chat.ts
│
├── mcp-server/
│   └── index.ts                # MCP tools: web_search, ai_summarize, check_balance
│
├── scripts/
│   ├── setup.sh                # Backs `npm run setup`
│   └── test-search.ts          # End-to-end CLI test
│
├── .env.example                # Template — copy to .env
├── claude_mcp.json             # MCP config for Claude Code
├── vite.config.ts
├── tsconfig.json
└── README.md
```

### Key boundaries to understand

- **`src/`** — runs in the browser. Never put secrets here. Env vars must be prefixed `VITE_`.
- **`server/`** — runs in Node.js. Holds all API keys. Never import server-only code from `src/`.
- **`api/`** — Vercel serverless functions. These mirror `server/index.ts` routes for production deployment.
- **`mcp-server/`** — MCP server for Claude Code integration. Runs as a separate process.

---

## Development Workflow

### Pick an issue

Browse [open issues](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/issues). Issues labelled **good first issue** are specifically chosen for first-time contributors — they are scoped, self-contained, and have clear acceptance criteria.

Comment on the issue before you start: _"I'd like to work on this"_ — this avoids duplicate effort.

### Create a branch

Branch off `main` using this naming convention:

| Type          | Pattern                        | Example                        |
| ------------- | ------------------------------ | ------------------------------ |
| Bug fix       | `fix/<short-description>`      | `fix/freighter-rejection-loop` |
| New feature   | `feat/<short-description>`     | `feat/search-history`          |
| Documentation | `docs/<short-description>`     | `docs/contributing-guide`      |
| Refactor      | `refactor/<short-description>` | `refactor/memoize-stats-grid`  |
| Test          | `test/<short-description>`     | `test/use-search-unit`         |
| Chore/DX      | `chore/<short-description>`    | `chore/add-eslint`             |

```bash
git checkout -b fix/freighter-rejection-loop
```

### Make your changes

- Keep changes focused — one concern per PR.
- Follow the [coding standards](#coding-standards) below.
- Run the typecheck frequently: `npx tsc --noEmit`.

### Commit messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer — e.g. Closes #12]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**

```
fix(wallet): catch Freighter rejection and set session to error state

Closes #1
```

```
feat(search): add localStorage search history with 20-entry limit

Stores { query, timestamp, txHash } entries.
Closes #9
```

```
docs: add CONTRIBUTING.md
```

---

## Submitting a Pull Request

1. Push your branch:

   ```bash
   git push origin fix/freighter-rejection-loop
   ```

2. Open a PR against `main` on GitHub.

3. Fill in the PR template:
   - **What does this PR do?** — one paragraph summary.
   - **Which issue does it close?** — link with `Closes #N`.
   - **How was it tested?** — steps you took to verify locally.
   - **Screenshots** — required for any UI change.

4. Make sure:
   - [ ] `npx tsc --noEmit` passes with no errors.
   - [ ] The app starts and the affected feature works manually.
   - [ ] No new `console.log` / debug statements left in.
   - [ ] No secrets or `.env` values committed.

5. A maintainer will review your PR. Please respond to review comments within a reasonable time. If you need more time, just say so — the PR won't be closed.

### PR size guidelines

| Change type   | Ideal PR size                        |
| ------------- | ------------------------------------ |
| Bug fix       | < 100 lines changed                  |
| Small feature | < 300 lines changed                  |
| Large feature | Break into logical sub-PRs           |
| Refactor      | One file / one abstraction at a time |

---

## Issue Guidelines

### Reporting a bug

Before opening a new issue:

1. Search existing issues — it may already be reported.
2. Try reproducing on the latest `main` branch.
3. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for known x402/Freighter issues.

When you open a bug, include:

- **Steps to reproduce** — numbered, minimal.
- **Expected behaviour** vs **actual behaviour**.
- **Environment:** OS, browser, Node version, Freighter version.
- **Console output / error messages** — paste the full stack trace.
- **Network tab screenshot** (for payment flow issues).

### Requesting a feature

- Explain the **problem** you are solving, not just the solution you have in mind.
- If the feature involves the payment flow or blockchain state, describe how edge cases (network error, wallet rejection, insufficient balance) should behave.
- Check the [open issues](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/issues) first — the backlog already has 50+ scoped ideas waiting for contributors.

---

## Coding Standards

### TypeScript

- **Strict mode is on** — `"strict": true` in `tsconfig.json`. Do not use `any` unless absolutely necessary and document why.
- Prefer `interface` for object shapes, `type` for unions and mapped types.
- Export types from `src/types/index.ts` if they are used across more than one file.
- No implicit `any` — always type function parameters and return values.

### React

- Functional components only — no class components.
- Co-locate state close to where it is used. Lift only when required.
- Use `useCallback` and `useMemo` when passing callbacks to memoized children or in hook internals, not by default everywhere.
- Clean up side effects in `useEffect` — cancel timers, abort fetch, remove listeners.
- Component files export one default component. Helpers live in the same file or a co-located `utils.ts`.

### Styling

- **Tailwind CSS only** — no inline `style={{}}` props and no external CSS files (except `src/index.css` for global resets).
- Use responsive prefixes (`sm:`, `md:`, `lg:`) for layout breakpoints.
- Animations use Framer Motion — do not add new animation libraries.
- Do not hardcode colour hex values — use Tailwind's colour palette.

### File and folder conventions

- File names: `PascalCase` for components (`SearchBar.tsx`), `camelCase` for hooks and utilities (`useSearch.ts`, `stellar.ts`).
- Each `components/<area>/` folder has an `index.ts` barrel export.
- Hooks live in `src/hooks/`. A hook file exports exactly one hook as its named export.

### Comments

Only write a comment when the **why** is non-obvious — a hidden constraint, a Stellar SDK quirk, or a workaround for a specific bug. Do not comment what the code does; well-named identifiers do that. Do not leave `TODO:` comments in PRs — open an issue instead.

Significant architecture decisions are recorded as [Architecture Decision Records](./docs/adr/README.md) in `docs/adr/`. If your change reverses or revises one of those decisions, update the relevant ADR (or write a new one that supersedes it).

```ts
// Freighter returns a Buffer, not a string — must convert to base64 explicitly.
// Using .toString() gives "[object Buffer]" (9 chars) causing x402 signature length error.
const signedAuthEntry = Buffer.from(raw as unknown as Uint8Array).toString('base64')
```

### Environment variables

- Never commit real secrets. `.env` is in `.gitignore` — keep it that way.
- Frontend env vars must be prefixed `VITE_` to be exposed to the browser by Vite.
- Server env vars go in `.env` and are read via `process.env`. Never import them in `src/`.
- When adding a new env var, add it to `.env.example` with a descriptive comment and a placeholder value.

---

## Testing

The frontend uses Vitest, React Testing Library, and jsdom for component tests. See the open [testing issues](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/issues?q=is%3Aopen+label%3Atesting) for areas that still need coverage. If you add a hook, component, or server route, include focused tests where practical.

### Component-test conventions

- Put tests next to the component as `<Component>.test.tsx`.
- Render with React Testing Library and query by accessible role or label before using test IDs.
- Test user-visible behavior (including guards and empty/loading states), not implementation details.
- Mock network, wallet, and toast boundaries; do not make payment calls from unit tests.
- Run `npm test` for a one-shot Vitest run or `npm run test:watch` while developing.

### Manual testing checklist

For any change to the search or payment flow, verify:

- [ ] Wallet disconnected → search is blocked with a clear message.
- [ ] Freighter not installed → error message shown, no crash.
- [ ] Freighter on wrong network (Public) → blocked with instructions.
- [ ] USDC balance = 0 → clear message shown.
- [ ] User rejects Freighter popup → session set to `error`, UI recovers.
- [ ] Successful search → results shown, txHash displayed, balance updated.

For UI changes:

- [ ] Test at 375px (mobile), 768px (tablet), 1280px (desktop) widths.
- [ ] No horizontal scroll at any breakpoint.
- [ ] Light and dark mode look acceptable (if theme toggle exists).

### Running the TypeScript compiler

```bash
# Check all TypeScript errors (does not emit files)
npx tsc --noEmit
```

### End-to-end test script

```bash
# Server must be running. Signs no payment — without a wallet it just reports the 402
npm run test:search "Stellar blockchain"
```

---

## Common Pitfalls

### x402 / Freighter

| Symptom                                | Likely cause                               | Fix                                                                              |
| -------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| "expected 64 got 9"                    | `Buffer.toString()` used instead of base64 | Use `Buffer.from(raw).toString('base64')`                                        |
| 402 loop never resolves                | Freighter on wrong network                 | Switch to Testnet in Freighter settings                                          |
| "Failed to parse payment requirements" | Server returning malformed header          | Check server logs; decode the `PAYMENT-REQUIRED` header with `base64 -d \| jq .` |
| Freighter popup never appears          | `createPaymentPayload()` not awaited       | Ensure `await` before the call                                                   |
| Balance not updating after payment     | `refresh()` not called post-search         | Call `refresh()` in the `useSearch` success path                                 |

### Vite / Build

| Symptom                  | Likely cause                            | Fix                                                                    |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------- |
| `global is not defined`  | Stellar SDK needs `globalThis` polyfill | Already handled in `vite.config.ts` — do not remove the `define` block |
| Buffer errors in browser | `buffer` package not aliased            | `resolve.alias` in `vite.config.ts` handles this                       |
| CORS errors in dev       | Frontend calling server directly        | Use the Vite proxy (`/search`, `/ai`, `/health` already proxied)       |

### Stellar / Horizon

| Symptom                  | Likely cause                  | Fix                                                                        |
| ------------------------ | ----------------------------- | -------------------------------------------------------------------------- |
| Account not found        | Account not funded on testnet | Fund it at Stellar Lab                                                     |
| USDC balance always 0    | Wrong USDC issuer address     | Use `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` for testnet |
| Transactions not loading | Horizon rate-limit            | Add a 500ms delay between calls; use pagination                            |

---

## Changelog & Releases

Every notable change to StellarSearch is recorded in [`CHANGELOG.md`](./CHANGELOG.md), which follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### When to update the changelog

If your PR changes behaviour that a deployer or user would care about, add an entry under the `## [Unreleased]` section of `CHANGELOG.md` in the same PR. Use the appropriate subsection:

| Subsection   | Use for                                           |
| ------------ | ------------------------------------------------- |
| `Added`      | New features, new env vars, new endpoints         |
| `Changed`    | Behaviour changes to existing features            |
| `Deprecated` | Features that will be removed in a future release |
| `Removed`    | Features removed in this release                  |
| `Fixed`      | Bug fixes                                         |
| `Security`   | Vulnerability fixes                               |

Docs-only, test-only, and internal refactor PRs do not require a changelog entry.

### Release process

Maintainers cut releases as follows:

1. Move entries from `## [Unreleased]` into a new `## [x.y.z] - YYYY-MM-DD` section.
2. Update the comparison links at the bottom of `CHANGELOG.md`.
3. Bump the version in `package.json` to match.
4. Tag the commit (`git tag vX.Y.Z`) and push the tag.
5. Publish the GitHub Release using the new changelog section as the release notes.

### Automating from conventional commits

Because all commits follow [Conventional Commits](#commit-messages), the changelog can be generated automatically. A future PR will wire up a tool such as [`git-cliff`](https://git-cliff.org) or [`conventional-changelog`](https://github.com/conventional-changelog/conventional-changelog) to produce entries from commit history. Until then, update `CHANGELOG.md` by hand — the commit types (`feat`, `fix`, `docs`, etc.) map directly onto the changelog subsections above.

---

## Getting Help

- **Bug or question about the code?** Open a [GitHub Issue](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/issues/new).
- **Something in this guide is wrong or unclear?** Open a PR fixing it — contributions to docs are just as valuable as code.
- **x402 protocol questions?** See the [official x402 docs](https://x402.org) and the [Stellar agentic payments guide](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar).
- **Freighter API reference?** [Stellar Freighter docs](https://docs.freighter.app).

---

## Recognition

All contributors are welcome to add themselves to a `CONTRIBUTORS` list. When your PR is merged, feel free to add your name and GitHub handle in a follow-up commit.

---

_StellarSearch — Stellar Hackathon 2026 · Agents on Stellar_.
.
