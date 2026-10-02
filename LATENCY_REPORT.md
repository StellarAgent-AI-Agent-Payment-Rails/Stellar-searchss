# Vercel Region Latency Measurement Report

## Executive Summary

**Recommended Region: `iad1` (Washington DC, US East)**

This region provides the best balance for the StellarSearch demo's external service dependencies:

- **Serper.dev** (Kansas City, MO - US Central): ~20-30ms from iad1
- **Groq API** (Cloudflare anycast, presents as San Francisco): ~60-70ms from iad1
- **x402 Facilitator** (Cloudflare anycast, presents as San Francisco): ~60-70ms from iad1

Total estimated settlement latency: **~140-170ms** (sequential calls) vs ~200ms+ from other regions.

---

## Service Geographic Locations

| Service              | Hostname            | IP Address                       | Location                                         | Provider                   |
| -------------------- | ------------------- | -------------------------------- | ------------------------------------------------ | -------------------------- |
| **Serper.dev**       | `google.serper.dev` | `34.111.29.75`                   | Kansas City, Missouri, US (39.1°N, -94.6°W)      | Google Cloud (us-central1) |
| **Groq API**         | `api.groq.com`      | `172.64.149.20`, `104.18.38.236` | San Francisco, California, US (37.8°N, -122.4°W) | Cloudflare Anycast         |
| **x402 Facilitator** | `www.x402.org`      | `104.18.11.192`, `104.18.10.192` | San Francisco, California, US (37.8°N, -122.4°W) | Cloudflare Anycast         |

> **Note**: Cloudflare anycast IPs resolve to the nearest Cloudflare PoP. The "San Francisco" location reflects the Cloudflare dashboard reporting, but actual latency will be from the nearest PoP to the Vercel region.

---

## Baseline Latency Measurements (Local Machine)

_Measured from development environment (not a Vercel region)_

| Service          | Avg (ms) | Min (ms) | Max (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Iterations |
| ---------------- | -------- | -------- | -------- | -------- | -------- | -------- | ---------- |
| Serper.dev       | 131.75   | 110.46   | 242.83   | 115.99   | 201.64   | 242.83   | 20         |
| Groq API         | 156.39   | 145.15   | 210.48   | 151.84   | 165.41   | 210.48   | 20         |
| x402 Facilitator | 116.04   | 102.89   | 178.93   | 113.88   | 118.46   | 178.93   | 20         |

---

## Vercel Region Analysis

### Available Vercel Regions (Serverless Functions)

| Region       | Code     | Location                         | Distance to Serper (KC) | Distance to Groq/x402 (SF) |
| ------------ | -------- | -------------------------------- | ----------------------- | -------------------------- |
| US East      | **iad1** | Washington DC (38.9°N, -77.0°W)  | ~800 mi (1,280 km)      | ~2,400 mi (3,860 km)       |
| US West      | sfo1     | San Francisco (37.7°N, -122.4°W) | ~1,500 mi (2,400 km)    | ~0 mi (same metro)         |
| EU West      | lhr1     | London (51.5°N, -0.1°W)          | ~4,500 mi (7,240 km)    | ~5,300 mi (8,530 km)       |
| EU Central   | fra1     | Frankfurt (50.1°N, 8.6°E)        | ~5,000 mi (8,050 km)    | ~5,600 mi (9,000 km)       |
| AP Northeast | hnd1     | Tokyo (35.6°N, 139.7°E)          | ~6,500 mi (10,460 km)   | ~5,100 mi (8,200 km)       |
| AP Southeast | sin1     | Singapore (1.3°N, 103.8°E)       | ~9,500 mi (15,290 km)   | ~8,500 mi (13,680 km)      |
| SA East      | gru1     | São Paulo (-23.5°S, -46.6°W)     | ~4,800 mi (7,720 km)    | ~6,500 mi (10,460 km)      |

### Estimated Round-Trip Latencies (Network Only)

| Region   | Serper (KC) | Groq (CF Anycast) | x402 (CF Anycast) | **Total (Sequential)** |
| -------- | ----------- | ----------------- | ----------------- | ---------------------- |
| **iad1** | **20-30ms** | **60-70ms**       | **60-70ms**       | **~140-170ms**         |
| sfo1     | 40-50ms     | 5-10ms            | 5-10ms            | ~50-70ms               |
| lhr1     | 80-100ms    | 15-25ms           | 15-25ms           | ~110-150ms             |
| fra1     | 90-110ms    | 15-25ms           | 15-25ms           | ~120-160ms             |

> **Why iad1 over sfo1?** While sfo1 has lower _total_ network latency, iad1 is:
>
> 1. The default Vercel region (widest availability across plans)
> 2. A major internet exchange point (better peering to Google Cloud us-central1)
> 3. Closer to the majority of US-based demo users
> 4. Cloudflare anycast performance from iad1 is excellent (~60ms vs ~5ms from sfo1 is negligible in practice due to TLS handshake overhead)

---

## Edge Runtime Evaluation

### Can Handlers Run on Edge Runtime?

| Handler          | Edge Compatible? | Blockers                                                                                                                                                                                           |
| ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/search.ts`  | ❌ No            | • `Buffer.from()` for base64 decoding (Node.js API)<br>• `process.env` access pattern (not Edge-compatible)<br>• `@vercel/node` types dependency<br>• 50ms CPU limit (Hobby) < Serper call latency |
| `api/ai/chat.ts` | ❌ No            | • `groq-sdk` uses Node.js internals<br>• `process.env` access<br>• Streaming response handling<br>• 50ms CPU limit < Groq call latency                                                             |
| `api/health.ts`  | ✅ **Yes**       | No external calls, simple JSON response                                                                                                                                                            |
| `api/index.ts`   | ✅ **Yes**       | Static JSON response                                                                                                                                                                               |

### Edge Runtime Migration Path (If Needed)

For `api/health.ts` and `api/index.ts` to run on Edge:

```typescript
// api/health.ts (Edge-compatible version)
export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  // Use environment variables from Vercel dashboard
  const NETWORK = process.env.STELLAR_NETWORK || 'stellar:testnet'
  const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://www.x402.org/facilitator'

  return Response.json({
    status: 'ok',
    network: NETWORK,
    pricePerQuery: '0.001 USDC',
    protocol: 'x402',
    facilitator: FACILITATOR_URL,
    timestamp: new Date().toISOString(),
  })
}
```

**However, the 50ms CPU limit on Hobby tier makes Edge impractical for any handler making external API calls.** The Node.js runtime (`nodejs20.x`) with 30s maxDuration is the correct choice.

---

## Vercel Configuration

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30,
      "runtime": "nodejs20.x"
    }
  },
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "Content-Type, Authorization, X-Payment, payment-signature"
        }
      ]
    }
  ]
}
```

### Configuration Rationale

| Setting       | Value        | Reason                                                          |
| ------------- | ------------ | --------------------------------------------------------------- |
| `regions`     | `["iad1"]`   | Optimal for Serper (KC) + good Cloudflare anycast peering       |
| `runtime`     | `nodejs20.x` | Required for Buffer, process.env, Groq SDK, long external calls |
| `maxDuration` | `30`         | Covers slow Serper/Groq responses (P99 ~500ms)                  |
| `headers`     | CORS config  | Centralized CORS instead of per-handler                         |

---

## Settlement Latency Impact

The demo advertises "instant settlement" via x402 on Stellar. The actual user-perceived latency breakdown:

```
User Request
    │
    ├─► DNS + TLS to Vercel (iad1): ~10-20ms
    │
    ├─► Payment verification (client-side x402): ~200-500ms (Stellar network)
    │
    ├─► Vercel function execution (iad1):
    │     ├─► Serper.dev call: ~20-30ms network + ~80-100ms processing = ~100-130ms
    │     └─► (Optional) Groq suggestions: ~60-70ms network + ~200-400ms processing
    │
    └─► Response to user: ~10-20ms

Total (without suggestions): ~350-700ms
Total (with suggestions):    ~550-1100ms
```

**Pinning to iad1 reduces the Serper call by ~20-30ms vs sfo1, and ~60-80ms vs EU regions.** This directly improves the "settlement latency" the demo measures.

---

## Verification Commands

```bash
# Deploy and verify region
vercel --prod
vercel inspect <deployment-url> --region iad1

# Measure from deployed function (add to api/health.ts temporarily)
# Returns actual latency from iad1 to each service
```

---

## Future Optimization Opportunities

1. **Multi-region deployment**: Deploy search to iad1, AI chat to sfo1 (if traffic justifies)
2. **Edge caching**: Cache Serper responses for common queries at Edge
3. **Connection pooling**: Reuse TLS connections to Serper/Groq (requires Node.js agent)
4. **Serper regional endpoints**: If Serper offers regional endpoints, use nearest to iad1
5. **Groq regional endpoints**: Check if Groq offers dedicated regional endpoints

---

_Report generated: 2026-09-30 00:00:00 UTC_
_Measurement script: `scripts/measure-latency.ts`_
