# API Reference

Base URL: `http://localhost:<PORT>` (see `.env.example` for `PORT`)

All paid routes use the [x402](https://x402.org) payment protocol:

- Price: 0.001 USDC per request
- Network: `stellar:testnet`
- Pay-to address: `STELLAR_RECEIVING_ADDRESS` (see `.env.example`)
- A request without a valid payment receives `402 Payment Required` with
  the payment challenge; retry with the signed payment header to receive
  a response.

## GET /search

<!-- FILL FROM PR #271 + route source -->

**Query parameters**

| Name          | Type          | Required | Default | Bounds    | Description            |
| ------------- | ------------- | -------- | ------- | --------- | ---------------------- |
| `q`           | string        | yes      | —       | —         | Search query           |
| `count`       | integer       | no       | ?       | ?         | Number of results      |
| `freshness`   | string        | no       | ?       | one of: ? | Recency filter         |
| `suggestions` | integer (0/1) | no       | 0       | 0 or 1    | Include AI suggestions |

**Response**

```json
{
  "results": [{ "...": "..." }],
  "suggestions": ["..."]
}
```

**Errors**

| Status | Code             | Meaning                     |
| ------ | ---------------- | --------------------------- |
| 400    | ?                | Missing/invalid `q`         |
| 402    | PAYMENT_REQUIRED | No valid payment attached   |
| 500    | ?                | Upstream Serper.dev failure |

**cURL example**

```bash
curl -X GET "http://localhost:3000/search?q=stellar+blockchain&count=10" \
  -H "X-PAYMENT: <signed-payment-header>"
```

## GET /images

<!-- same structure -->

## GET /news

<!-- same structure -->

## POST /ai/chat

<!-- same structure -->

## GET /health

<!-- same structure -->
