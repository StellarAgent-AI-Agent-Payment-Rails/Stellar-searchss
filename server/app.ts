/**
 * App factory for tests.
 *
 * The Express application is built as a module-level side effect in
 * server/index.ts (routes, rate limiting and x402 middleware all attach to it
 * there). tests/parity.test.ts needs that same instance without starting a
 * listener, so this re-exports it behind a factory-shaped API.
 *
 * server/index.ts only calls `app.listen()` when NODE_ENV is neither
 * 'production' nor 'test', so importing it under NODE_ENV=test yields a fully
 * wired app with no open port.
 */

import app from './index.js'

export function createApp(): typeof app {
  return app
}

export default app
