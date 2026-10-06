import logger from './logger'

/**
 * Lightweight runtime guard for the Serper.dev response shape.
 *
 * Serper occasionally renames or drops fields without notice. Rather than let
 * those changes surface as silent `undefined`s in the mapped results, we log a
 * warning naming exactly which expected fields are missing so the drift shows
 * up in the server logs. This never throws — a schema warning must not take the
 * request path down.
 *
 * `value` is either the object to inspect or an array whose first element is
 * treated as representative of the collection (Serper returns homogeneous
 * arrays for organic/images/news results).
 */
export function warnOnMissingFields(
  context: string,
  value: unknown,
  requiredFields: string[],
): void {
  if (value == null) {
    logger.warn(`[serper-schema] ${context} is missing or null (expected an object or array)`)
    return
  }

  const sample = Array.isArray(value) ? value[0] : value

  if (sample == null || typeof sample !== 'object') {
    // An empty array is a legitimate "no results" response, not a schema drift.
    if (Array.isArray(value) && value.length === 0) return
    logger.warn(`[serper-schema] ${context} is not an object (got ${typeof sample})`)
    return
  }

  const missing = requiredFields.filter((field) => !(field in (sample as Record<string, unknown>)))

  if (missing.length > 0) {
    logger.warn(`[serper-schema] ${context} is missing expected field(s): ${missing.join(', ')}`)
  }
}
