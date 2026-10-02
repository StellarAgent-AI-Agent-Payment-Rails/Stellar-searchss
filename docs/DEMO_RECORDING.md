# Recording the StellarSearch demo

The README ships a lightweight, animated walkthrough of the payment flow
([`public/demo-flow.svg`](../public/demo-flow.svg)) so the flow is visible
without any local setup. That asset illustrates the UI states — it is **not**
a screen recording.

This guide is for capturing the real thing: a screen-recorded video of a live
search that settles **0.001 USDC on Stellar testnet**, with the transaction
verifiable on an explorer. A recorded run is the strongest evidence that the
x402 flow actually works end to end.

---

## What the recording must show

Record one uninterrupted take, ideally 2–3 minutes, covering the six states the
UI already tracks (see `src/components/search/PaymentFlowVisualizer.tsx`):

1. **Connect** — click _Connect Freighter_ and approve in the extension. The
   header shows your address and live USDC balance.
2. **Search** — type a query and hit _SEARCH_.
3. **402** — the `x402 PAYMENT FLOW` panel marks _Request_ and then
   _402 Received_ (`GET /search` returned `HTTP 402 Payment Required`).
4. **Sign** — the Freighter popup appears for a Soroban auth entry; approve it.
   The _Sign_ step lights up.
5. **Settle** — _Retry_ and _Facilitate_ run; the panel shows `✓ SETTLED`, the
   `TX HASH` row, and `PAID 0.001 USDC / NETWORK TESTNET / STATUS SETTLED`.
6. **Results** — real Serper.dev results render. Click the `TX HASH` link to
   open the transaction on Stellar Expert and let the explorer page load on
   camera.

> The **real settlement is the point**. If the `TX HASH` link does not resolve
> to a confirmed testnet transaction, the recording does not satisfy the
> hackathon requirement.

---

## Prerequisites

| Requirement                       | Notes                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Node.js ≥ 18, npm ≥ 9             | See [CONTRIBUTING.md](../CONTRIBUTING.md)                          |
| `SERPER_API_KEY`                  | Real Google results — <https://serper.dev>                         |
| `GROQ_API_KEY`                    | AI assistant — <https://console.groq.com/keys>                     |
| `OPENZEPPELIN_API_KEY`            | x402 facilitator — <https://channels.openzeppelin.com/testnet/gen> |
| `STELLAR_RECEIVING_ADDRESS`       | Testnet keypair that receives the 0.001 USDC                       |
| Freighter + funded testnet wallet | USDC trustline added and testnet USDC claimed                      |
| Screen recorder                   | OBS, Kap, ScreenToGif, QuickTime, or Loom                          |

---

## 1. Prepare a clean testnet wallet

1. Install [Freighter](https://freighter.app) and switch to **Testnet**
   (Settings → Network).
2. Create/fund an account at the
   [Stellar Lab account creator](https://laboratory.stellar.org/#account-creator?network=test).
3. Add the testnet USDC trustline
   (`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) and claim
   testnet USDC so the run does not fail on a zero balance.

## 2. Configure and start the app

```bash
cp .env.example .env      # fill in the keys listed above
npm install
npm run dev:all           # server on :3001, frontend on :5173
```

Confirm the backend is healthy before recording:

```bash
curl http://localhost:3001/health
```

Optional dry run without a browser — settles a real testnet payment from the CLI:

```bash
npm run test:search "Stellar blockchain"
```

## 3. Record

- Frame the browser window (1280×720 or 1920×1080 is plenty) with the Freighter
  extension visible so the signing popup is on camera.
- Do a silent rehearsal first; the flow takes seconds, so slow down if a step is
  hard to follow.
- Keep the console open in a second window — the `useSearch` logs
  (`🚀 Initial request` → `💰 402 received` → `🔐 Freighter popup` → `✅ Search
complete!`) make the flow easy to follow and prove each step.

## 4. Export and compress

Prefer MP4 for video and GIF only if it stays small. GitHub rejects files over
100 MB and the repo should stay lean — **host large recordings externally**
(YouTube, Loom, a GitHub Release asset, or `git-lfs`) and link to them.

```bash
# MP4 -> optimised GIF (keep under ~10 MB)
ffmpeg -i demo.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" demo.gif

# MP4 -> web-friendly MP4
ffmpeg -i demo.mp4 -vcodec libx264 -crf 28 -preset slow -an demo-web.mp4
```

## 5. Embed it in the README

Add the recording to the `## Demo` section next to the animated walkthrough.
For an externally hosted video, link it rather than committing it:

```markdown
[![Watch the StellarSearch demo](public/demo-flow.svg)](https://your-hosting-url)
```

If you do commit a small GIF, place it under `public/` and reference it with a
relative path so it renders on GitHub:

```markdown
![StellarSearch demo](public/demo.gif)
```

## 6. Before you call it done

- [ ] The video shows a Freighter signature prompt for the Soroban auth entry.
- [ ] The `TX HASH` link resolves to a **confirmed** transaction on
      [Stellar Expert testnet](https://stellar.expert/explorer/testnet).
- [ ] Amount, network, and status (`0.001 USDC`, `TESTNET`, `SETTLED`) are legible.
- [ ] Real search results appear after settlement.
- [ ] No API keys, seed phrases, or `.env` contents are visible on screen.
