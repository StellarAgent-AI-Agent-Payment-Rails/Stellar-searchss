import { performance } from 'node:perf_hooks'

export interface InvocationTiming {
  invocationType: 'cold' | 'warm'
  /** Module initialization to handler entry, available only on first use. */
  coldStartLatencyMs: number | null
  handlerEnteredAt: number
}

const moduleInitializedAt = performance.now()
let invocationCount = 0

/**
 * Measures the runtime-observable part of a serverless cold start. The
 * platform's request-arrival timestamp is not exposed to a Vercel function, so
 * module initialization is the earliest timestamp available to application
 * code and gives a lower-bound cold-start measurement.
 */
export function startInvocation(): InvocationTiming {
  const handlerEnteredAt = performance.now()
  const isColdStart = invocationCount === 0
  invocationCount += 1

  return {
    invocationType: isColdStart ? 'cold' : 'warm',
    coldStartLatencyMs: isColdStart
      ? Math.max(0, Math.round(handlerEnteredAt - moduleInitializedAt))
      : null,
    handlerEnteredAt,
  }
}

export function handlerElapsedMs(timing: InvocationTiming): number {
  return Math.max(0, Math.round(performance.now() - timing.handlerEnteredAt))
}
