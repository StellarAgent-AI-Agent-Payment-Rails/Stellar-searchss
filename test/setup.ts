/**
 * Vitest setup — deterministic environment for the server tests.
 *
 * No real API keys or wallet address are needed because the tests never reach
 * a live upstream: they stub fetch / the Groq SDK and assert on the sanitized
 * error payloads we send back to the client.
 */

process.env.NODE_ENV = 'production'
process.env.SERPER_API_KEY = 'test-serper-key'
process.env.GROQ_API_KEY = 'test-groq-key'
process.env.STELLAR_RECEIVING_ADDRESS =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
process.env.STELLAR_NETWORK = 'stellar:testnet'
