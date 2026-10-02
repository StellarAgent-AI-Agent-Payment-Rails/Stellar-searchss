# Performance testing

`npm run load-test` runs the Node.js load generator against `GET /api/search?q=…`.
It reports requests per second, p95 latency, and error rate as text and JSON.

Use a **local development** serverless instance (`vercel dev`) with
`NODE_ENV=development` and `PAYMENTS_DISABLED=true`. Production ignores the
payment-disable flag. The test sends no payment headers and performs no USDC
settlement, but requests still call Serper and may consume API quota.

```sh
PAYMENTS_DISABLED=true BASE_URL=http://localhost:3000 npm run load-test
```

| Variable | Default | Purpose |
| --- | --- | --- |
| BASE_URL | http://localhost:3000 | Local development instance |
| PAYMENTS_DISABLED | unset | Must be true as an explicit test acknowledgement |
| CONCURRENCY | 50 | Concurrent request workers |
| DURATION_MS | 30000 | Test duration in milliseconds |
| QUERY | load test | Search query |

Requests time out after 10 seconds. The client acknowledgement flag does not
configure the server: set the development server environment separately.
No production performance results have been measured. Record environment,
concurrency, throughput, p95 latency, and error rate before drawing conclusions.
