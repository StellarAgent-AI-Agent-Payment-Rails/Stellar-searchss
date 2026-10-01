export type { WalletState, StellarTransaction } from '../hooks/useFreighterWallet'
export type { SearchResult, SearchSession } from '../hooks/useSearch'

export interface ApiStat {
  totalQueries: number
  totalUsdcSettled: string
  avgLatencyMs: number
  uptime: string
}

// Injected by Vite at build time from package.json → version.
// See vite.config.ts `define: { __APP_VERSION__ }`.
declare const __APP_VERSION__: string

