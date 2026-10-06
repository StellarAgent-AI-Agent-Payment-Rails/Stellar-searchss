export type { WalletState, StellarTransaction } from '../hooks/useFreighterWallet'
export type { SearchResult, SearchSession } from '../hooks/useSearch'

export interface ApiStat {
  totalQueries: number
  totalUsdcSettled: string
  avgLatencyMs: number
  uptime: string
}

export interface HealthResponse {
  status: string
  totalQueries: number
  totalUsdcSettled: string | number
  /** Mean upstream Serper request latency, when the server exposes it. */
  avgLatencyMs: number | null
  /** Runtime initialization-to-first-handler-entry measurement for this instance. */
  coldStartLatencyMs?: number | null
  /** Handler execution duration on a warm instance. */
  warmHandlerLatencyMs?: number | null
  invocationType?: 'cold' | 'warm' | null
  uptime: string
  serperApiConfigured?: boolean
  groqApiConfigured?: boolean
  receivingAddressConfigured?: boolean
}

export class HealthResponseValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HealthResponseValidationError'
  }
}

export function parseHealthResponse(data: any): HealthResponse {
  if (!data || typeof data !== 'object') {
    throw new HealthResponseValidationError('Invalid health response format')
  }
  const latency = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

  return {
    status: data.status ?? 'ok',
    totalQueries: data.totalQueries ?? 0,
    totalUsdcSettled: data.totalUsdcSettled ?? '0.000',
    avgLatencyMs: latency(data.avgLatencyMs),
    coldStartLatencyMs: latency(data.coldStartLatencyMs),
    warmHandlerLatencyMs: latency(data.warmHandlerLatencyMs),
    invocationType:
      data.invocationType === 'cold' || data.invocationType === 'warm' ? data.invocationType : null,
    uptime: data.uptime ?? '100%',
    serperApiConfigured: Boolean(data.serperApiConfigured),
    groqApiConfigured: Boolean(data.groqApiConfigured),
    receivingAddressConfigured: Boolean(data.receivingAddressConfigured),
  }
}
