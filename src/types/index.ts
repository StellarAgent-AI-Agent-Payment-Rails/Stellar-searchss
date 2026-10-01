export type { WalletState, StellarTransaction } from '../hooks/useFreighterWallet'
export type { SearchResult, SearchSession } from '../hooks/useSearch'

export interface ApiStat {
  totalQueries: number
  totalUsdcSettled: string
  avgLatencyMs: number
  uptime: string
}

/**
 * Response contract for `GET /health`, shared by the Express route
 * (server/index.ts) and the serverless handler (api/health.ts).
 */
export interface HealthResponse {
  status: string
  version: string
  network: string
  pricePerQuery: string
  protocol: string
  facilitator: string
  totalQueries: number
  totalUsdcSettled: string
  avgLatencyMs: number
  cacheHitRate: string
  uptime: string
  serperApiConfigured: boolean
  groqApiConfigured: boolean
  receivingAddressConfigured: boolean
}

/** Thrown when a /health payload does not satisfy {@link HealthResponse}. */
export class HealthResponseValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Invalid /health response: ${issues.join('; ')}`)
    this.name = 'HealthResponseValidationError'
    this.issues = issues
  }
}

const HEALTH_STRING_FIELDS = [
  'status',
  'version',
  'network',
  'pricePerQuery',
  'protocol',
  'facilitator',
  'totalUsdcSettled',
  'cacheHitRate',
  'uptime',
] as const satisfies ReadonlyArray<keyof HealthResponse>

const HEALTH_NUMBER_FIELDS = ['totalQueries', 'avgLatencyMs'] as const satisfies ReadonlyArray<
  keyof HealthResponse
>

const HEALTH_BOOLEAN_FIELDS = [
  'serperApiConfigured',
  'groqApiConfigured',
  'receivingAddressConfigured',
] as const satisfies ReadonlyArray<keyof HealthResponse>

/**
 * Validates an unknown payload as a {@link HealthResponse}. Returns the typed
 * value on success, or throws {@link HealthResponseValidationError} listing
 * every field that failed so a contract break is obvious rather than silently
 * rendering as `undefined` in the UI.
 */
export function parseHealthResponse(input: unknown): HealthResponse {
  if (typeof input !== 'object' || input === null) {
    throw new HealthResponseValidationError(['response is not an object'])
  }

  const record = input as Record<string, unknown>
  const issues: string[] = []

  for (const field of HEALTH_STRING_FIELDS) {
    if (typeof record[field] !== 'string') issues.push(`${field} must be a string`)
  }
  for (const field of HEALTH_NUMBER_FIELDS) {
    if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
      issues.push(`${field} must be a finite number`)
    }
  }
  for (const field of HEALTH_BOOLEAN_FIELDS) {
    if (typeof record[field] !== 'boolean') issues.push(`${field} must be a boolean`)
  }

  if (issues.length > 0) throw new HealthResponseValidationError(issues)

  return record as unknown as HealthResponse
}

// Injected by Vite at build time from package.json → version.
// See vite.config.ts `define: { __APP_VERSION__ }`.
declare const __APP_VERSION__: string

