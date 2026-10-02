import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet, ChevronDown, ExternalLink,
  Copy, CheckCheck, RefreshCw, LogOut, AlertCircle, X,
} from 'lucide-react'
import type { WalletState, StellarTransaction } from '../../hooks/useFreighterWallet'
import {
  truncateAddress, truncateHash,
  explorerAccountUrl, explorerTxUrl, formatTimeAgo,
  IS_MAINNET, EXPECTED_WALLET_NETWORK, AMOUNT_USDC, USDC_ISSUER
} from '../../lib/stellar'
import type { WalletId, WalletOption } from '../../lib/wallets'
import { WALLET_OPTIONS } from '../../lib/wallets'

interface Props {
  wallet: WalletState
  transactions: StellarTransaction[]
  txLoading: boolean
  onConnect: () => void
  onConnectWith: (id: WalletId) => void
  onDisconnect: () => void
  onRefresh: () => void
}

export function WalletPanel({
  wallet, transactions, txLoading,
  onConnect, onConnectWith, onDisconnect, onRefresh,
}: Props) {
  const [open, setOpen]     = useState(false)
  const [copied, setCopied] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const isWrongNetwork = wallet.connected && wallet.network !== EXPECTED_WALLET_NETWORK
  const hasTrustline = wallet.hasUsdcTrustline !== false
  const needsTrustline = wallet.connected && !wallet.loading && !hasTrustline

  const copy = () => {
    if (!wallet.publicKey) return
    navigator.clipboard.writeText(wallet.publicKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /* ── Not connected ── */
  if (!wallet.connected) {
    return (
<div className="relative flex flex-col items-start gap-2">
        <motion.button
          onClick={() => setPickerOpen(o => !o)}
          disabled={wallet.loading}
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          aria-label="Connect wallet"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 font-display text-xs tracking-wider text-white/50 hover:border-neon-cyan/40 hover:text-neon-cyan transition-all disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {wallet.loading ? (
            <motion.div
              className="w-3.5 h-3.5 rounded-full border border-neon-cyan/40 border-t-neon-cyan"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          ) : (
            <Wallet className="w-3.5 h-3.5" />
          )}
          {wallet.loading ? 'CONNECTING...' : 'CONNECT WALLET'}
          <ChevronDown className={`w-3 h-3 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </motion.button>

        {wallet.hint && (
          <p role="status" className="max-w-xs text-xs text-red-300" aria-live="polite">
            {wallet.hint}
          </p>
        )}

        <AnimatePresence>
          {pickerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/60 sm:hidden"
                onClick={() => setPickerOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                role="dialog"
                aria-label="Choose a wallet"
                className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 z-50 rounded-t-2xl sm:rounded-xl overflow-hidden pb-4 sm:pb-0 w-full sm:w-[320px]"
                style={{
                  background: 'rgba(6,13,20,0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(0,245,255,0.15)',
                }}
              >
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <span className="font-display text-xs text-white/30 tracking-widest">CHOOSE A WALLET</span>
                  <button
                    onClick={() => setPickerOpen(false)}
                    aria-label="Close wallet picker"
                    className="p-1 rounded text-white/30 hover:text-white/60"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2">
                  {WALLET_OPTIONS.map(w => {
                    const disabled = !w.supportsSignAuthEntry
    )
  }

  /* ── Connected ── */
  return (
    <div className="relative">
      <motion.button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Wallet menu"
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-display text-xs tracking-wider transition-all ${
          isWrongNetwork 
            ? 'border-red-500/50 bg-red-500/5 text-red-400' 
            : 'border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan'
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className={`w-2 h-2 rounded-full animate-pulse ${isWrongNetwork ? 'bg-red-500' : 'bg-neon-green'}`} />
        <span>{truncateAddress(wallet.publicKey!)}</span>
        <span className="text-white/30">·</span>
        <span className={isWrongNetwork ? 'text-red-300' : 'text-neon-amber'}>
          {isWrongNetwork
            ? 'WRONG NETWORK'
            : needsTrustline
              ? 'NO USDC TRUSTLINE'
              : `${wallet.usdcBalance} USDC`}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 z-40 bg-black/60 sm:hidden" 
              onClick={() => setOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 z-50 rounded-t-2xl sm:rounded-xl overflow-hidden pb-4 sm:pb-0 w-full sm:w-[320px]"
              style={{
                background: 'rgba(6,13,20,0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(0,245,255,0.15)',
              }}
            >
            {/* Header */}
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-display text-xs text-white/30 tracking-widest">
                  {(activeWallet?.name ?? 'WALLET').toUpperCase()}
                </span>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isWrongNetwork ? 'bg-red-500' : 'bg-neon-green'}`} />
                  <span className={`font-display text-[10px] tracking-widest uppercase ${isWrongNetwork ? 'text-red-400' : 'text-neon-green/70'}`}>
                    {wallet.network} {isWrongNetwork && '(EXPECTED ' + EXPECTED_WALLET_NETWORK + ')'}
                  </span>
                </div>
              </div>

              {/* Address */}
              <div className="flex items-center gap-2 mb-3">
                <a
                  href={explorerAccountUrl(wallet.publicKey!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-white/40 hover:text-neon-cyan/70 transition-colors truncate flex-1"
                >
                  {wallet.publicKey}
                </a>
                <button onClick={copy} className="p-1 rounded text-white/30 hover:text-white/60 flex-shrink-0">
                  {copied
                    ? <CheckCheck className="w-3.5 h-3.5 text-neon-green" />
                    : <Copy className="w-3.5 h-3.5" />
                  }
                </button>
              </div>

              {/* Balances */}
              <div className="grid grid-cols-2 gap-2">
                <div className="py-2 px-3 rounded-lg bg-white/5">
                  <p className="font-display text-white/30" style={{ fontSize: '9px' }}>USDC BALANCE</p>
                  <p className="font-display text-lg text-neon-amber mt-0.5">{wallet.usdcBalance}</p>
                  <p className="font-display text-white/25 mt-0.5" style={{ fontSize: '9px' }}>
                    ~{Math.floor(parseFloat(wallet.usdcBalance) / parseFloat(AMOUNT_USDC)).toLocaleString()} queries
                  </p>
                </div>
                <div className="py-2 px-3 rounded-lg bg-white/5">
                  <p className="font-display text-white/30" style={{ fontSize: '9px' }}>XLM BALANCE</p>
                  <p className="font-display text-lg text-neon-cyan mt-0.5">{wallet.xlmBalance}</p>
                  <p className="font-display text-white/25 mt-0.5" style={{ fontSize: '9px' }}>for gas fees</p>
                </div>
              </div>

              {needsTrustline && (
                <div className="mt-2 py-2 px-3 rounded-lg bg-neon-amber/5 border border-neon-amber/20">
                  <p className="font-display text-[10px] text-neon-amber tracking-widest uppercase">
                    NO USDC TRUSTLINE
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    This account cannot receive USDC until a trustline is added.
                  </p>
                  <p className="font-mono text-[10px] text-white/30 mt-1 break-all">
                    Issuer: {USDC_ISSUER}
                  </p>
                  <a
                    href="https://developers.stellar.org/docs/encyclopedia/trustlines"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 font-display text-[10px] text-neon-cyan/70 hover:text-neon-cyan transition-colors uppercase tracking-widest"
                  >
                    Add USDC trustline <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}

              {wallet.error && (
                <div className="mt-2 flex items-center gap-2 py-1.5 px-2 rounded bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300">{wallet.error}</p>
                </div>
              )}
            </div>

            {/* Transactions */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-display text-white/30 tracking-widest" style={{ fontSize: '10px' }}>
                  RECENT TRANSACTIONS
                </span>
                <button
                  onClick={onRefresh}
                  disabled={txLoading || wallet.refreshing}
                  className="p-1 text-white/30 hover:text-neon-cyan transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${wallet.refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {txLoading ? (
                <div className="flex justify-center py-4">
                  <motion.div
                    className="w-4 h-4 rounded-full border border-neon-cyan/30 border-t-neon-cyan"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-xs text-white/20 text-center py-3">No transactions yet</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {transactions.map(tx => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded bg-white/3 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-xs text-white/50 capitalize">
                          {tx.type.replace('_', ' ')}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <a
                            href={explorerTxUrl(tx.hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-white/25 hover:text-neon-cyan transition-colors flex items-center gap-1"
                            style={{ fontSize: '10px' }}
                          >
                            {truncateHash(tx.hash, 6)} <ExternalLink className="w-2 h-2" />
                          </a>
                          <span className="text-white/20" style={{ fontSize: '10px' }}>
                            {formatTimeAgo(tx.timestamp)}
                          </span>
                        </div>
                      </div>
                      <p className="font-display text-xs text-white/60 flex-shrink-0 ml-2">
                        {tx.amount} {tx.asset}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-3 pt-0 flex gap-2">
              {IS_MAINNET ? (
                <a
                  href="https://www.circle.com/en/usdc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 rounded-lg border border-neon-amber/20 text-center font-display text-[10px] text-neon-amber/70 hover:bg-neon-amber/5 transition-colors uppercase tracking-widest"
                >
                  Buy USDC ↗
                </a>
              ) : (
                <a
                  href="https://lab.stellar.org/account/fund"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 rounded-lg border border-neon-cyan/20 text-center font-display text-[10px] text-neon-cyan/70 hover:bg-neon-cyan/5 transition-colors uppercase tracking-widest"
                >
                  Fund Testnet ↗
                </a>
              )}
              <button
                onClick={() => { onDisconnect(); setOpen(false) }}
                className="flex items-center gap-1.5 py-2 px-3 rounded-lg border border-white/10 font-display text-xs text-white/30 hover:text-red-400 hover:border-red-500/30 transition-all"
              >
                <LogOut className="w-3 h-3" /> Disconnect
              </button>
            </div>

            <div className="px-3 pb-3">
              <button
                onClick={() => { setOpen(false); setPickerOpen(true) }}
                className="w-full py-2 rounded-lg border border-white/10 font-display text-[10px] text-white/40 hover:text-neon-cyan hover:border-neon-cyan/30 transition-all uppercase tracking-widest"
              >
                Switch wallet
              </button>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
