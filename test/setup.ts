/**
 * Vitest setup — deterministic environment for the server tests.
 *
 * No API keys or wallet address are needed because the tests only exercise
 * rate limiting, which rejects requests before any upstream call happens.
 */

// 'test' not 'production': React only exports `jsxDEV` from its development
// build, so pinning production here breaks every component test. server/index.ts
// also skips app.listen() for both values, so the port stays free.
process.env.NODE_ENV = 'test'
process.env.SERPER_API_KEY = 'test-serper-key'
process.env.GROQ_API_KEY = 'test-groq-key'
process.env.STELLAR_RECEIVING_ADDRESS =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
process.env.STELLAR_NETWORK = 'stellar:testnet'
process.env.RATE_LIMIT_ENABLED = 'true'
