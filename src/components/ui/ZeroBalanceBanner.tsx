import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Coins, ExternalLink, ShieldAlert, X } from 'lucide-react'
import { IS_MAINNET, USDC_ISSUER } from '../../lib/stellar'
import { FUNDING_URLS } from '../../lib/funding'

interface Props {
  connected: boolean
  publicKey: string | null
  usdcBalance: string
/**
   * `null` means the trustline state has not been determined yet.
   */
  usddTrustline?: boolean | null

  // Navigates to the funding guide section on the docs page via SPA routing
  // (a plain hash anchor would reload the app back to the search page).
  onOpenGuide: () => void
}

const dismissKey = (publicKey: string) => `zero-balance-banner-dismissed:${publicKey}`

const trustlineDismissKey = (publicKey: string) =>
  `usdc-trustline-banner-dismissed:${publicKey}`

export function ZeroBalanceBanner({ connected, publicKey, usdcBalance, usdcTrustline, onOpenGuide }: Props) {
  const [dismissed, setDismissed] = useState(false)

  // Reset / restore dismissal state when the connected account changes.
  useEffect(() => {
    if (!publicKey) {
      setDismissed(false)
      return
    }
    // The missing-trustline notice is more urgent than the zero-balance one,
    // so it gets its own dismissal key.
    const key =
      usddTrustline === false ? trustlineDismissKey(publicKey) : dismissKey(publicKey)
    setDismissed(sessionStorage.getItem(key) === '1')
  }, [publicKey, usdcTrustline])

  const isZeroBalance = parseFloat(usdcBalance || '0') === 0
  const missingTrustline = usdcTrustline === false
  const visible =
    connected && !IS_MAINNET && isZeroBalance && !dismissed

  const onDismiss = () => {
    if (publicKey) {
      const key = missingTrustline
        ? trustlineDismissKey(publicKey)
        : dismissKey(publicKey)
      sessionStorage.setItem(key, '1')
    }
    setDismissed(true)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={`border-neon-amber/25 bg-neon-amber/5 relative flex items-start gap-3 p-4 pr-10 rounded-xl border `}
          style={{ boxShadow: '0 0 20px rgba(255,193,7,0.06)' }}
          role="status"
        >
{missingTrustline ? (
            <ShieldAlert className="w-4 h-4 mt-0.5 text-neon-amber flex-shrink-0" />
          ) : (
            <Coins className="w-4 h-4 mt-0.5 text-neon-amber flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0 space-y-2">
            {missingTrustline ? (
              <>
                <p className="text-sm text-neon-amber/90 leading-relaxed">
                  Your account has <span className="font-semibold">no USDC trustline</span>, so it cannot receive USDC at all.
                  Add one before using the faucet.
                </p>
                <p className="text-xs text-white/45 break-all">
                  Issuer:
                  <code className="ml-1 font-mono text-white/70">{USDC_ISSUER}</code>
                </p>
                <p className="text-xs text-white/45">
                  Add the trustline in your wallet, then come back for free testnet USDC.
                  <a
                    href={TRUSTLINE_GUIDE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neon-cyan/80 hover:text-neon-cyan transition-colors inline-flex items-center gap-1 ml-1"
                  >
                    How to add a trustline <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-neon-amber/90 leading-relaxed">
                  Your USDC trustline is set up, but the balance is zero. You need testnet USDC to search
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss notice"
            className="absolute top-3 right-3 p-1 rounded text-white/30 hover:text-white/70 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
