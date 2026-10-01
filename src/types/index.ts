export type { WalletState, StellarTransaction } from '../hooks/useFreighterWallet'
export type { SearchResult, SearchSession } from '../hooks/useSearch'

export interface ApiStat {
  totalQueries: number
  totalUsdcSettled: string
  avgLatencyMs: number
  uptime: string
}

export interface HealthResponse {
  status: 'ok'
  network: string
  pricePerQuery: string
  protocol: 'x402'
  facilitator: string
  totalQueries: number
  totalUsdcSettled: string
  avgLatencyMs: number
  uptime: string
  serperApiConfigured: boolean
  groqApiConfigured: boolean
  receivingAddressConfigured: boolean
}

export class HealthResponseValidationError extends Error {
  constructor(invalidFields: string[]) {
    super(`Invalid /health response: ${invalidFields.join(', ')}`)
    this.name = 'HealthResponseValidationError'
  }
}

export function parseHealthResponse(value: unknown): HealthResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HealthResponseValidationError(['response must be an object'])
  }

  const data = value as Record<string, unknown>
  const stringFields = ['network', 'pricePerQuery', 'facilitator', 'totalUsdcSettled', 'uptime']
  const booleanFields = ['serperApiConfigured', 'groqApiConfigured', 'receivingAddressConfigured']
  const invalidFields = [
    ...(data.status === 'ok' ? [] : ['status']),
    ...(data.protocol === 'x402' ? [] : ['protocol']),
    ...stringFields.filter(field => typeof data[field] !== 'string'),
    ...(['totalQueries', 'avgLatencyMs'] as const).filter(field =>
      typeof data[field] !== 'number' || !Number.isFinite(data[field]),
    ),
    ...booleanFields.filter(field => typeof data[field] !== 'boolean'),
  ]

  if (invalidFields.length > 0) {
    throw new HealthResponseValidationError(invalidFields)
  }

  return data as unknown as HealthResponse
}

// Injected by Vite at build time from package.json → version.
// See vite.config.ts `define: { __APP_VERSION__ }`.
declare const __APP_VERSION__: string

