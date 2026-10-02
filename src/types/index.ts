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
  avgLatencyMs: number
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
  return {
    status: data.status ?? 'ok',
    totalQueries: data.totalQueries ?? 0,
    totalUsdcSettled: data.totalUsdcSettled ?? '0.000',
    avgLatencyMs: data.avgLatencyMs ?? 0,
    uptime: data.uptime ?? '100%',
    serperApiConfigured: Boolean(data.serperApiConfigured),
    groqApiConfigured: Boolean(data.groqApiConfigured),
    receivingAddressConfigured: Boolean(data.receivingAddressConfigured),
  }
}
