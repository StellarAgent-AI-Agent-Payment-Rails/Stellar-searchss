import { m } from 'framer-motion'
import { Search, BookOpen, BarChart2, ExternalLink, Zap, Github } from 'lucide-react'
import { WalletPanel } from '../wallet/WalletPanel'
import { MainnetIndicator, NetworkBadge } from './NetworkBadge'
import type { WalletState, StellarTransaction } from '../../hooks/useFreighterWallet'

type Page = 'search' | 'docs' | 'dashboard'

const NAV_ITEMS: { id: Page; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'search',    label: 'SEARCH',       Icon: Search    },
  { id: 'docs',      label: 'HOW IT WORKS', Icon: BookOpen  },
  { id: 'dashboard', label: 'DASHBOARD',    Icon: BarChart2 },
]

interface Props {
  page: Page
  onNavigate: (p: Page) => void
  onPrefetch?: (p: Page) => void
  wallet: WalletState
  transactions: StellarTransaction[]
  txLoading: boolean
  onConnect: () => void
  onDisconnect: () => void
  onRefresh: () => void
}

export function Navbar({
  page, onNavigate, onPrefetch,
  wallet, transactions, txLoading,
  onConnect, onDisconnect, onRefresh,
}: Props) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/5"
      style={{ background: 'rgba(2,4,8,0.85)', backdropFilter: 'blur(16px)' }}
    >
      {/* Mainnet-only page-level indicator (renders nothing on testnet) */}
      <MainnetIndicator />

      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-5">

        {/* Logo */}
        <button
          onClick={() => onNavigate('search')}
          onMouseEnter={() => onPrefetch?.('search')}
          onFocus={() => onPrefetch?.('search')}
          className="flex items-center gap-2 flex-shrink-0 group"
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ background: 'rgba(0,245,255,0.12)', border: '1px solid rgba(0,245,255,0.35)' }}
          >
            <Zap className="w-3.5 h-3.5 text-neon-cyan" />
          </div>
          <span className="font-display text-sm text-white tracking-wider">
            STELLAR<span className="text-neon-cyan">SEARCH</span>
          </span>
        </button>

        {/* Persistent network badge — always visible on every page/breakpoint */}
        <NetworkBadge />

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1" role="navigation" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              onMouseEnter={() => onPrefetch?.(id)}
              onFocus={() => onPrefetch?.(id)}
              aria-current={page === id ? "page" : undefined}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display text-xs tracking-wider transition-colors"
              style={{ color: page === id ? '#00f5ff' : 'rgba(255,255,255,0.6)' }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {page === id && (
                <m.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: 'rgba(0,245,255,0.08)',
                    border: '1px solid rgba(0,245,255,0.15)',
                  }}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              )}
            </button>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href="https://github.com/stellar/x402-stellar"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-white/60 hover:text-white/80 hover:bg-white/5 transition-all"
          >
            <Github className="w-4 h-4" />
          </a>
          <a
            href="https://developers.stellar.org/docs/build/agentic-payments/x402"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display text-xs text-white/60 hover:text-white/80 transition-all"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            x402 DOCS <ExternalLink className="w-3 h-3" />
          </a>
          <WalletPanel
            wallet={wallet}
            transactions={transactions}
            txLoading={txLoading}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    </header>
  )
}
