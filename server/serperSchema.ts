/**
 * serperSchema.ts — soft validation of Serper.dev response payloads.
 * Logs warnings when expected fields are missing; never throws, so a
 * partial upstream schema change degrades gracefully instead of 500ing.
 */
export function warnOnMissingFields(label: string, payload: unknown, fields: string[]): void {
  if (payload === null || payload === undefined) {
    console.warn(`[serper-schema] ${label}: payload is ${payload === null ? 'null' : 'undefined'}; expected fields: ${fields.join(', ')}`)
    return
  }
  const items = Array.isArray(payload) ? payload : [payload]
  items.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      console.warn(`[serper-schema] ${label}[${index}]: expected an object, got ${typeof item}`)
      return
    }
    for (const field of fields) {
      if (!(field in (item as Record<string, unknown>))) {
        console.warn(`[serper-schema] ${label}[${index}]: missing field "${field}"`)
      }
    }
  })
}
