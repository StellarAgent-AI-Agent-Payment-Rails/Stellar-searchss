import express, { type Express } from 'express'
import healthHandler from '../api/health'
import searchHandler from '../api/search'

/**
 * Build the Express application.
 *
 * The `/health` and `/search` routes delegate to the same Vercel serverless
 * handlers that are used in production, so the Express server and the
 * serverless deployment target cannot drift. This is what `tests/parity.test.ts`
 * exercises.
 */
export function createApp(): Express {
  const app = express()
  app.use(express.json())

  app.get('/health', (req, res) => {
    void healthHandler(req as never, res as never)
  })

  app.get('/search', (req, res) => {
    void searchHandler(req as never, res as never)
  })

  return app
}

export default createApp
