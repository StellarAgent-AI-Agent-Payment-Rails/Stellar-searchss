/**
 * Best-effort counter used by the serverless handlers.
 *
 * The Express server keeps its counters in memory (see `server/index.ts`).
 * Serverless invocations are stateless, so without a configured shared store
 * these increments are intentionally best-effort and never block the response.
 */
export async function incrementCounter(_name: string, _by = 1): Promise<void> {
  // No shared counter store is configured for serverless deployments.
}
