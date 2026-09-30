/**
 * Vitest setup — deterministic environment for the server tests.
 *
 * No API keys or wallet address are needed because the tests only exercise
 * rate limiting, which rejects requests before any upstream call happens.
 */

process.env.NODE_ENV = 'production'
process.env.SERPER_API_KEY = 'test-serper-key'
process.env.GROQ_API_KEY = 'test-groq-key'
process.env.STELLAR_RECEIVING_ADDRESS =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
process.env.STELLAR_NETWORK = 'stellar:testnet'
process.env.RATE_LIMIT_ENABLED = 'true'
