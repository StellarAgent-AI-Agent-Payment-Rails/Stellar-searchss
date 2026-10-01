/**
 * Vitest setup — deterministic environment for the server tests.
 *
 * No real API keys or wallet address are needed because the tests never reach
 * a live upstream: they stub fetch / the Groq SDK and assert on the sanitized
 * error payloads we send back to the client.
 */

// NODE_ENV=test (not production) for two reasons:
//  1. server/index.ts only calls app.listen() when NODE_ENV is neither
//     'production' nor 'test', so importing the app keeps the port free.
//  2. React resolves its development build under NODE_ENV=test, which is what
//     @testing-library/react's act() requires. Under 'production' React loads
//     the production build and throws "act(...) is not supported in production
//     builds of React".
// Suites that need production CORS/error behaviour set it themselves.
process.env.NODE_ENV = 'test'
process.env.SERPER_API_KEY = 'test-serper-key'
process.env.GROQ_API_KEY = 'test-groq-key'
process.env.STELLAR_RECEIVING_ADDRESS =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
process.env.STELLAR_NETWORK = 'stellar:testnet'
