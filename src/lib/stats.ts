/**
 * stats.ts
 * Best-effort request counters for the serverless API handlers.
 *
 * Each serverless invocation runs in its own short-lived instance, so these
 * counters are intentionally in-memory and per-instance — they are a cheap
 * signal, never an authoritative total (see issue #113: stats are meaningless
 * on serverless because each cold start resets them). The API treats counting
 * as fire-and-forget, so every function is async and must never throw into the
 * request path.
 */

export type CounterName = 'searches' | 'results' | 'payments' | (string & {})

const counters = new Map<string, number>()

/**
 * Increment a named counter by `amount` (default 1). Resolves to the new value.
 * Callers treat this as best-effort and attach `.catch()`, so failures here are
 * swallowed rather than surfaced.
 */
export async function incrementCounter(name: CounterName, amount = 1): Promise<number> {
  const next = (counters.get(name) ?? 0) + amount
  counters.set(name, next)
  return next
}

/** Read a single counter's current value for this instance. */
export async function getCounter(name: CounterName): Promise<number> {
  return counters.get(name) ?? 0
}

/** Snapshot of all counters for this instance. */
export async function getCounters(): Promise<Record<string, number>> {
  return Object.fromEntries(counters)
}
