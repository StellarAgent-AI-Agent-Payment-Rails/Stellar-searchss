import { describe, expect, it } from 'vitest'
import { parseHealthResponse } from './index'

describe('parseHealthResponse invocation latency fields', () => {
  it('keeps Serper, cold-start, and warm-handler latency separate', () => {
    expect(parseHealthResponse({
      avgLatencyMs: 80,
      coldStartLatencyMs: 14,
      warmHandlerLatencyMs: 3,
      invocationType: 'cold',
    })).toMatchObject({
      avgLatencyMs: 80,
      coldStartLatencyMs: 14,
      warmHandlerLatencyMs: 3,
      invocationType: 'cold',
    })
  })

  it('does not turn missing latency measurements into misleading zeroes', () => {
    expect(parseHealthResponse({}).avgLatencyMs).toBeNull()
    expect(parseHealthResponse({}).coldStartLatencyMs).toBeNull()
    expect(parseHealthResponse({}).warmHandlerLatencyMs).toBeNull()
  })

  it('rejects invalid latency values and unknown invocation states', () => {
    expect(parseHealthResponse({
      avgLatencyMs: '80',
      coldStartLatencyMs: -1,
      warmHandlerLatencyMs: Infinity,
      invocationType: 'unknown',
    })).toMatchObject({
      avgLatencyMs: null,
      coldStartLatencyMs: null,
      warmHandlerLatencyMs: null,
      invocationType: null,
    })
  })
})
