export type { WalletState, StellarTransaction } from '../hooks/useFreighterWallet'
export type { SearchResult, SearchSession } from '../hooks/useSearch'

export interface ApiStat {
  totalQueries: number
  totalUsdcSettled: string
  avgLatencyMs: number
  uptime: string
}

// Shared contract for `GET /health` (see server/index.ts and server/health.test.ts).
export interface HealthResponse {
  status: 'ok'
  version: string
  network: string
  pricePerQuery: string
  protocol: 'x402'
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

export class HealthResponseValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HealthResponseValidationError'
  }
}

export function parseHealthResponse(value: unknown): HealthResponse {
  const h = (typeof value === 'object' && value !== null ? value : null) as Record<string, unknown> | null
  const valid =
    h !== null &&
    h.status === 'ok' &&
    typeof h.version === 'string' &&
    typeof h.network === 'string' &&
    typeof h.pricePerQuery === 'string' &&
    h.protocol === 'x402' &&
    typeof h.facilitator === 'string' &&
    typeof h.totalQueries === 'number' &&
    typeof h.totalUsdcSettled === 'string' &&
    typeof h.avgLatencyMs === 'number' &&
    typeof h.cacheHitRate === 'string' &&
    typeof h.uptime === 'string' &&
    typeof h.serperApiConfigured === 'boolean' &&
    typeof h.groqApiConfigured === 'boolean' &&
    typeof h.receivingAddressConfigured === 'boolean'
  if (!valid) throw new HealthResponseValidationError('Invalid health response payload')
  return value as HealthResponse
}

// Injected by Vite at build time from package.json → version.
// See vite.config.ts `define: { __APP_VERSION__ }`.
declare const __APP_VERSION__: string

