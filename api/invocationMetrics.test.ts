import { describe, expect, it } from 'vitest'
import { handlerElapsedMs, startInvocation } from './invocationMetrics'

describe('serverless invocation timing', () => {
  it('labels the first handler entry as cold and exposes a bounded startup measurement', () => {
    const timing = startInvocation()

    expect(timing.invocationType).toBe('cold')
    expect(timing.coldStartLatencyMs).toEqual(expect.any(Number))
    expect(timing.coldStartLatencyMs).toBeGreaterThanOrEqual(0)
  })

  it('labels later entries as warm and measures handler execution separately', () => {
    const timing = startInvocation()

    expect(timing.invocationType).toBe('warm')
    expect(timing.coldStartLatencyMs).toBeNull()
    expect(handlerElapsedMs(timing)).toBeGreaterThanOrEqual(0)
  })
})
