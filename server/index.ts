/**
 * server/index.ts — thin startup shell.
 *
 * The Express app and route logic live in server/app.ts (which delegates to
 * the framework-free handlers in server/handlers.ts). This module only binds
 * the port and keeps backwards-compatible re-exports for anything that
 * historically imported them from here.
 */
import dotenv from 'dotenv'
import { createApp, getStartupDetails } from './app.js'

dotenv.config()

const PORT = process.env.PORT || 3001

export { createApp }
export { getStartupDetails }
export { receipts, addReceipt, validateQuery } from './app.js'
export type { Receipt } from './app.js'

const app = createApp()

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  const details = getStartupDetails()
  app.listen(PORT, () => {
    console.log(`\n🚀 StellarSearch on http://localhost:${PORT}`)
    console.log(`   Network:     ${details.network}`)
    console.log(`   Facilitator: ${details.facilitator}`)
    console.log(`   Serper:      ${details.serperConfigured ? '✓' : '✗ MISSING'}`)
    console.log(`   Groq:        ${details.groqConfigured ? '✓' : '✗ MISSING'}`)
    console.log(`   Receiving:   ${details.receiving}`)
    console.log(`   ${details.cors}\n`)
  })
}

export default app
