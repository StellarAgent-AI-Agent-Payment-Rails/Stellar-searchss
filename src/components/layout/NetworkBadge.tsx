import { AlertTriangle, Globe } from 'lucide-react'
import { IS_MAINNET } from '../../lib/constants'

export interface NetworkBadgeStyle {
  /** Short, always-visible network label. */
  label: 'MAINNET' | 'TESTNET'
  /** Tailwind classes for the badge container. */
  className: string
  /** Tailwind classes for the leading icon. */
  iconClassName: string
  /** Accessible description announced to screen readers. */
  ariaLabel: string
  /** Machine-readable network marker, also used by tests. */
  network: 'mainnet' | 'testnet'
}

/**
 * Single source of truth for the two visual treatments. Mainnet reuses the
 * amber "real funds" convention already used across the dashboard/wallet
 * (see `IS_MAINNET ? 'text-neon-amber'`), while testnet gets a calm emerald
 * treatment so the two are never confused.
 */
export function getNetworkBadgeStyle(isMainnet: boolean): NetworkBadgeStyle {
  if (isMainnet) {
    return {
      label: 'MAINNET',
      className:
        'bg-neon-amber/20 border-neon-amber text-neon-amber shadow-[0_0_12px_rgba(255,184,0,0.45)]',
      iconClassName: 'text-neon-amber',
      ariaLabel: 'Active network: Stellar Mainnet',
      network: 'mainnet',
    }
  }
  return {
    label: 'TESTNET',
    className: 'bg-emerald-500/10 border-emerald-400/40 text-emerald-300',
    iconClassName: 'text-emerald-300',
    ariaLabel: 'Active network: Stellar Testnet',
    network: 'testnet',
  }
}

interface BadgeProps {
  /** Defaults to the build-time constant; overridable for testing. */
  isMainnet?: boolean
}

/**
 * Persistent navbar badge that makes the active network impossible to miss.
 * Rendered on every page (see `Navbar`) and never hidden on small screens.
 */
export function NetworkBadge({ isMainnet = IS_MAINNET }: BadgeProps) {
  const { label, className, iconClassName, ariaLabel, network } = getNetworkBadgeStyle(isMainnet)
  const Icon = isMainnet ? AlertTriangle : Globe

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      data-network={network}
      className={`flex items-center gap-1.5 px-2 py-1 rounded border font-display text-[10px] font-bold tracking-widest transition-colors ${className}`}
    >
      <Icon className={`w-2.5 h-2.5 ${iconClassName}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

/**
 * Subtle, full-width page-level indicator shown only on mainnet. Lives at the
 * top of the sticky navbar so it stays visible on every page and cannot be
 * mistaken for a testnet session, without pushing the layout around on testnet.
 */
export function MainnetIndicator() {
  if (!IS_MAINNET) return null

  return (
    <div
      role="alert"
      data-testid="mainnet-indicator"
      data-network="mainnet"
      className="flex items-center justify-center gap-2 px-4 py-1 bg-neon-amber text-dark-900 font-display text-[10px] font-bold tracking-[0.25em]"
    >
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      <span>MAINNET ACTIVE · REAL FUNDS</span>
    </div>
  )
}
