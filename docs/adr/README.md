# Architecture Decision Records (ADRs)

This directory records the significant architecture decisions made in StellarSearch —
the "why" behind choices that are otherwise only visible (if at all) as a one-line
code comment. When a comment is the only record of a decision, the next refactor can
delete it without anyone knowing it mattered.

## What gets an ADR?

Write an ADR when a decision is:

- **Hard to reverse** — e.g. the x402 middleware API shape, or shared constants
  imported across the frontend/backend boundary.
- **Non-obvious** — a future reader would ask "why didn't you just do X?"
- **A workaround with a reason** — e.g. the Freighter `signAuthEntry` base64
  conversion. If someone "cleans it up", payments break.

Small reversible choices (variable names, component layout) do **not** need an ADR.

## Format

Every ADR is a numbered Markdown file:

```
NNNN-short-kebab-case-title.md
```

- `NNNN` — zero-padded, monotonically increasing (`0001`, `0002`, ...). Never reuse a number.
- One decision per file. If a decision is reversed, write a **new** ADR that
  supersedes the old one and update the old file's `Status`.

## Template

Copy `template.md` to `NNNN-short-title.md` and fill it in. Every section is
mandatory except *Alternatives considered* (though it is strongly encouraged).

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](0001-x402-middleware-api.md) | x402 Express middleware: `paymentMiddlewareFromConfig` | Accepted |
| [0002](0002-freighter-signauthentry-base64.md) | Freighter `signAuthEntry` buffer → base64 conversion | Accepted |
| [0003](0003-shared-constants-package.md) | Shared constants module across frontend and Node | Accepted |
