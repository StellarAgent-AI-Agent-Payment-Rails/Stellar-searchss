# 0002. Freighter `signAuthEntry` buffer → base64 conversion

- **Status:** Accepted
- **Date:** 2026-04-12
- **Deciders:** @maintainers

## Context

In the browser payment flow (`src/hooks/useSearch.ts`), the x402 Stellar client needs
a signed Soroban auth entry to build the payment payload. The flow calls Freighter's
`signAuthEntry()` via the signer object we hand to `ExactStellarScheme`.

The trap: Freighter's `signAuthEntry()` returns the signed hash as a **raw `Buffer`**
of bytes, not a string. `ExactStellarScheme` expects `signedAuthEntry` as a
**base64 string** of those raw bytes.

The original code did what any reasonable person does and called `.toString()` on the
return value, which produces the string `"[object Buffer]"` — 9 characters. The
facilitator then rejected the payload with:

```
signature of length 64 expected, got 9
```

That error message is actively misleading: it looks like a malformed key or a bad
signature format, when in fact the signature never made it out of the browser intact.
Debugging it required decoding the `X-PAYMENT` header and comparing lengths byte by
byte. This is now also documented in `CONTRIBUTING.md` (Common Pitfalls) and
`TROUBLESHOOTING.md`, because it is the single most common breakage for new
contributors working on the payment flow.

## Decision

Always convert Freighter's raw buffer output explicitly to base64 before handing it
to the x402 client:

```ts
const raw = result.signedAuthEntry
const signedAuthEntry = typeof raw === 'string'
  ? raw
  : Buffer.from(raw as unknown as Uint8Array).toString('base64')
```

The `typeof raw === 'string'` guard keeps the code correct across Freighter versions
(some versions already return a base64 string) and the `Buffer.from(...)`
normalizes the buffer case. The `Buffer` import comes from the `buffer` package,
aliased in `vite.config.ts` for the browser.

## Alternatives considered

- **`raw.toString()`** — the one-character-looking shortcut that caused the bug.
  Produces `"[object Buffer]"` because `Buffer.prototype.toString` on the raw value
  yields the default encoding of the *object*, not the bytes. Rejected: broken.
- **`raw.toString('base64')` directly** — works when the value truly is a `Buffer`,
  but fails if a Freighter version returns a `Uint8Array` (no base64 overload
  guaranteed) or already-encoded string. Rejected: fragile across wallet versions.
- **Wrapping Freighter in our own typed signer with runtime validation** — most
  robust long-term, but adds an abstraction layer for a single quirk. Rejected for
  now: the guarded conversion is two lines and self-contained.

## Consequences

- **Easier:** payment flow works on all Freighter versions we support; the guard
  makes future Freighter output-shape changes a non-event.
- **Harder:** the `as unknown as Uint8Array` cast is ugly and required because
  Freighter's typings do not discriminate the union. It is *intentional* — do not
  "clean it up".
- **Accepted risk:** if Freighter ever returns an object that is neither string nor
  `Uint8Array`, we fail at signature-length validation again. The x402 client's
  error surfaces that quickly.
- **Revisit when:** `@stellar/freighter-api` publishes a stable typed return for
  `signAuthEntry`, or the x402 Stellar scheme starts accepting binary payloads
  directly.

## References

- Header comment in `src/hooks/useSearch.ts` ("KEY INSIGHT from Stellar docs").
- `CONTRIBUTING.md` — Common Pitfalls table, row `"expected 64 got 9"`.
- [Freighter API docs](https://docs.freighter.app) — `signAuthEntry`.
- Related browser-runtime constraint: Stellar SDK needs the `buffer` polyfill, see
  `vite.config.ts` (`define` + `resolve.alias`).
