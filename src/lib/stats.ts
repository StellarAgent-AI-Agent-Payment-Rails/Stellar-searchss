/**
 * stats.ts — cross-invocation counters for the serverless (Vercel) API.
 *
 * The Express server keeps its counters in `server/index.ts` process memory,
 * which works because the process is long-lived. Serverless handlers do not
 * get that: every cold start would reset the totals to zero, making the
 * reported search volume meaningless (issue #113).
 *
 * When `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are configured we
 * persist to Upstash Redis over its REST API. With no configuration we fall
 * back to a process-local map, which is only meaningful for local development.
 *
 * Best-effort by design: callers are expected to swallow rejections so a stats
 * outage never fails a paid search response.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/** True when counters are persisted outside the process. */
export const configured = Boolean(UPSTASH_URL && UPSTASH_TOKEN)

/** Process-local fallback. Lost on every cold start — dev only. */
const memory = new Map<string, number>()

async function upstash(command: string[]): Promise<number> {
  const res = await fetch(UPSTASH_URL as string, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })

  if (!res.ok) {
    throw new Error(`Upstash command failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as { result?: unknown }
  return Number(body.result ?? 0)
}

/**
 * Add `by` to the named counter and return its new value.
 *
 * Rejects if the remote store is unreachable; callers should `.catch(() => {})`
 * so telemetry never blocks the response it is describing.
 */
export async function incrementCounter(name: string, by = 1): Promise<number> {
  if (!configured) {
    const next = (memory.get(name) ?? 0) + by
    memory.set(name, next)
    return next
  }

  return upstash(['INCRBY', `stellar-search:${name}`, String(by)])
}
