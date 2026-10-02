/**
 * useFreighterWallet.ts
 * Multi-wallet integration with a minimal internal signer interface.
 * Supports Freighter, Albedo, xBull, Lobstr, Rabet and Ledger via @stellar/wallets-kit.
 * Fetches live balances from Stellar Horizon.
 */

import { useState, useCallback, useEffect } from 'react'
let isConnected: any, requestAccess: any, getAddress: any, getNetwork: any, signAuthEntry: any
try {
  // eslin-disable-next-line
  const freighter = require('@stellar/freighter-api')
  isConnected = freighter.isConnected
  requestAccess = freighter.requestAccess
  getAddress = freighter.getAddress
  getNetwork = freighter.getNetwork
  signAuthEntry = freighter.signAuthEntry
} catch {
  // Freighter not available; other wallets can still be used.
}
import { Horizon } from '@stellar/stellar-sdk'
import { HORIZON_URL, USDC_ISSUER } from '../lib/stellar'

export type WalletId =
  | 'freighter'
  | 'albedo'
  | 'xbull'
  | 'lobstr'
  | 'rabet'
  | 'ledger'

export interface WalletMeta {
  id: WalletId
  name: string
  icon: string
  supportsSignAuthEntry: boolean
  description?: string
}

/**
 * Minimal internal signer interface.
 * The x402 flow only requires an address and the ability to sign an auth entry.
 */
export interface Signer {
  getAddress(): Promise<string>
  signAuthEntry(authEntryXdr: string, options?: { networkPassphrase?: string }): Promise<string>
}

export interface WalletState {
  publicKey: string | null
  connected: boolean
  network: string
  walletId: WalletId | null
  walletName: string | null
  xlmBalance: string
  usdcBalance: string
  loading: boolean
  refreshing: boolean
  error: string | null
  hint: string | null
}

export interface StellarTransaction {
  id: string
  hash: string
  type: string
  amount: string
  asset: string
  from: string
  to: string
  timestamp: string
  memo?: string
}

export const DEFAULT_TX_PAGE_SIZE = 15

/**
 * Wallet catalog. Only wallets that support signAuthEntry are marked as supported.
 * Wizards like Rabet do not expose signAuthEntry and are excluded from the picker.
 */
export const WALLETS: WalletMeta[] = [
  {
    id: 'freighter',
    name: 'Freighter',
    icon: '🚀',
    supportsSignAuthEntry: true,
    description: 'Browser extension by Stellar Development Foundation',
  },
  {
    id: 'albedo',
    name: 'Albedo',
    icon: '🐍',
    supportsSignAuthEntry: true,
    description: 'Web wallet with signAuthEntry support',
  },
  {
    id: 'xbull',
    name: 'xBull',
    icon: '🐒',
    supportsSignAuthEntry: true,
    description: 'Extension and mobile wallet',
  },
  {
    id: 'lobstr',
    name: 'Lobstr',
    icon: '👁',
    supportsSignAuthEntry: true,
    description: 'Mobile and extension wallet',
  },
  {
    id: 'rabet',
    name: 'Rabet',
    icon: '🐅',
    supportsSignAuthEntry: false,
    description: 'Does not support signAuthEntry',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    icon: '🔒',
    supportsSignAuthEntry: true,
    description: 'Hardware wallet with signAuthEntry support',
  },
]

export const SUPPORTED_WALLETS = WALLETS.filter(w => w.supportsSignAuthEntry)
export const UNSUPPORTED_WALLETS = WALLETS.filter(w => !w.supportsSignAuthEntry)

function freighterSigner(): Signer {
  return {
    async getAddress() {
      const res = await getAddress()
      if (res.error) throw new Error(res.error.message)
      if (!res.address) throw new Error('Could not get wallet address')
      return res.address
    },
    async signAuthEntry(authEntryXdr, options) {
      if (typeof signAuthEntry !== 'function') {
        throw new Error('Freighter does not support signAuthEntry')
      }
      const res = await signAuthEntry(authEntryXdr, options)
      if (res.error) throw new Error(res.error.message)
      return res.signedAuthEntry || res.authEntry || res.result
    },
  }
}

function stellarWalletsKitSigner(walletId: WalletId): Signer {
  return {
    async getAddress() {
      // eslint-disable-next-line
      const kit = require('@creit.tech/stellar-wallets-kit')
      const { StellarWalletsKet, WalletsKetEnabled } = kit
      const kitInstance = new StellarWalletsKey()
      kitInstance.setProductKey('STARSEARCH')
      kitInstance.setProductIcon('')
      kitInstance.setWallets([walletId as any])
      await kitInstance.openModal()
      const { address } = await kitInstance.getAddress()
      if (!address) throw new Error('Could not get wallet address')
      return address
    },
    async signAuthEntry(authEntryXdr, options) {
      // eslint-disable-next-line
      const kit = require('@creit.tech/stellar-wallets-kit')
      const { StellarWalletsKet } = kit
      const kitInstance = new StellarWalletsKit()
      kitInstance.setProductKey('STARSEARCH')
      kitInstance.setProductIcon('')
      kitInstance.setWallets([walletId as any])
      const res = await kitInstance.signAuthEntry(authEntryXdr, {
        networkPassphrase: options?.networkPassphrase,
      })
      return res.authEntry || res.signedAuthEntry
    },
  }
}

function getSignerFor(walletId: WalletId): Signer {
  if (walletId === 'freighter') return freighterSigner()
  return stellarWalletsKitSigner(walletId)
}

export const horizon = new Horizon.Server(HORIZON_URL)

const MAX_RETRIES = 4
const BASE_DELAY_MS = 1000
const BALANCE_CACHE_TTL_MS = 5000

const balanceCache = new Map<string, { xlm: string; usdc: string; ts: number }>()

function isRateLimitError(err: any): boolean {
  if (!err) return false
  if (err.response?.status === 429) return true
  if (err.status === 429) return true
  return false
}

function getRetryAfterMs(err: any): number | null {
  const headers = err?.response?.headers
  if (!headers) return null
  const raw =
    typeof headers.get === 'function'
      ? headers.get('retry-after')
      : headers['retry-after']
  if (!raw) return null
  const seconds = parseInt(raw, 10)
  if (Number.isNaN(seconds)) return null
  return seconds * 1000
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn()
    } catch (err: any) {
      if (!isRateLimitError(err) || attempt >= MAX_RETRIES) {
        throw err
      }
      const retryAfter = getRetryAfterMs(err)
      const delay =
        retryAfter ?? BASE_DELAY_MS * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
      attempt += 1
    }
  }
}

function mapOperation(op: any): StellarTransaction {
  return {
    id: op.id,
    hash: op.transaction_hash,
    type: op.type,
    amount: op.amount ? parseFloat(op.amount).toFixed(4) : '—',
    asset:
      op.asset_type === 'native'
        ? 'XLM'
        : op.asset_code || 'Unknown',
    from: op.from || op.funder || '',
    to: op.to || op.account || '',
    timestamp: op.created_at,
    memo: op.transaction?.memo,
  }
}
export function useFreighterWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    publicKey: null,
    connected: false,
    network: 'TESTNET',
    walletId: null,
    walletName: null,
    xlmBalance: '0',
    usdcBalance: '0',
    loading: false,
    refreshing: false,
    error: null,
    hint: null,
  })
  const [transactions, setTransactions] = useState<StellarTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
const [signerRef] = useState({ current: null as Signer | null })
  const [txLoadingMore, setTxLoadingMore] = useState(false)
  const [txCursor, setTxCursor] = useState<string | null>(null)
  const [txHasMore, setTxHasMore] = useState(false)
  const [transactionError, setTransactionError] = useState<string | null>(null)

  // Fetch real balances from Horizon
  const fetchBalances = useCallback(async (publicKey: string) => {
    try {
      const cached = balanceCache.get(publicKey)
      if (cached && Date.now() - cached.ts < BALANCE_CACHE_TTL_MS) {
        return
      }

      const account = await withBackoff(() => horizon.loadAccount(publicKey))

      let xlm = '0'
      let usdc = '0'

      for (const balance of account.balances) {
        if (balance.asset_type === 'native') {
          xlm = parseFloat(balance.balance).toFixed(4)
        } else if (
          balance.asset_type === 'credit_alphanum4' &&
          (balance as any).asset_code === 'USDC' &&
          (balance as any).asset_issuer === USDC_ISSUER
        ) {
          usdc = parseFloat(balance.balance).toFixed(6)
        }
      }

      balanceCache.set(publicKey, { xlm, usdc, ts: Date.now() })

      setWallet(prev => ({
        ...prev,
        xlmBalance: xlm,
        usdcBalance: usdc,
        error: null,
      }))
    } catch (err: any) {
      if (isRateLimitError(err)) {
        setWallet(prev => ({
          ...prev,
          error: 'Rate limited, retrying…',
        }))
        return
      }
      setWallet(prev => ({
        ...prev,
        error: err.message || 'Failed to load account',
      }))
    }
  }, [])

// Fetch real transaction history from Horizon (first page)
  const fetchTransactions = useCallback(
    async (publicKey: string, pageSize: number = DEFAULT_TX_PAGE_SIZE) => {
      setTxLoading(true)
      setTransactionError(null)
      try {
        const ops = await withBackoff(() =>
          horizon
            .operations()
            .forAccount(publicKey)
            .order('desc')
            .limit(pageSize)
            .call()
        )

      const txs = ops.records
        .filter((op: any) => op.type === 'payment' || op.type === 'create_account')
        .map((op: any) => ({
          id: op.id,
          hash: op.transaction_hash,
          type: op.type,
          amount: op.amount ? parseFloat(op.amount).toFixed(4) : '—',
          asset:
            op.asset_type === 'native'
              ? 'XLM'
              : op.asset_code || 'Unknown',
          from: op.from || op.funder || '',
          to: op.to || op.account || '',
          timestamp: op.created_at,
          memo: op.transaction?.memo,
        }))

        const txs = ops.records
          .filter((op: any) => op.type === 'payment' || op.type === 'create_account')
          .map(mapOperation)

        setTransactions(txs)
        setTxCursor(ops.records.length > 0 ? ops.records[ops.records.length - 1].paging_token : null)
        setTxHasMore(ops.records.length === pageSize)
      } catch (err: any) {
        if (!isRateLimitError(err)) {
          console.error('Failed to load transactions:', err)
          setTransactionError('Could not load transactions. Please try again.')
        }
      } finally {
        setTxLoading(false)
      }
    },
    []
  )

  // Load the next page of transactions using Horizon cursor paging
  const loadMoreTransactions = useCallback(
    async (publicKey: string, pageSize: number = DEFAULT_TX_PAGE_SIZE) => {
      if (!publicKey || !txCursor || !txHasMore || txLoadingMore) {
        return
      }
      setTxLoadingMore(true)
      try {
        const ops = await horizon
          .operations()
          .forAccount(publicKey)
          .order('desc')
          .limit(pageSize)
          .cursor(txCursor)
          .call()

        const nextTxs = ops.records
          .filter((op: any) => op.type === 'payment' || op.type === 'create_account')
          .map(mapOperation)

        if (ops.records.length === 0) {
          // Horizon returned an empty page — stop paging cleanly
          setTxHasMore(false)
          return
        }

        setTransactions(prev => [
...prev, ...nextTxs])
        setTxCursor(ops.records[ops.records.length - 1].paging_token)
        setTxHasMore(ops.records.length === pageSize)
      } catch (err: any) {
        if (!isRateLimitError(err)) {
          console.error('Failed to load more transactions:', err)
          setTransactionError('Could not load transactions. Please try again.')
          // Keep existing transactions on failure and stop further paging attempts
          setTxHasMore(false)
        }
      } finally {
        setTxLoadingMore(false)
      }
    },
    [txCursor, txHasMore, txLoadingMore]
  )

// Connect a wallet by id. Defaults to Freighter for backward compatibility.
  const connect = useCallback(async (walletId: WalletId = 'freighter') => {
    setWallet(prev => ({ ...prev, loading: true, error: null, hint: null }))

    try {
      const meta = WALLETS.find(w => w.id === walletId)
      if (!meta) throw new Error(`Unknown wallet: ${walletId}`)
      if (!meta.supportsSignAuthEntry) {
        throw new Error(
          `${meta.name} does not support signAuthEntry, which is required for the x402 payment flow.`
        )
      }

      let address: string
      let network = 'TESTNET'

      if (walletId === 'freighter') {
        const connected = await isConnected()
        if (!connected.isConnected) {
          throw new Error(
            'Freighter extension not found. Install it from freighter.app'
          )
        }
        const accessResult = await requestAccess()
        if (accessResult.error) {
          throw new Error(accessResult.error.message)
        }
        const addressResult = await getAddress()
        if (addressResult.error || !addressResult.address) {
          throw new Error('Could not get wallet address')
        }
        address = addressResult.address
        const networkResult = await getNetwork()
        network = networkResult.network || 'TESTNET'
      } else {
        const signer = getSignerFor(walletId)
        address = await signer.getAddress()
        signerRef.current = signer
      }

      setWallet(prev => ({
        ...prev,
        publicKey: address,
        connected: true,
        network,
        walletId,
        walletName: meta.name,
        loading: false,
        error: null,
      }))

      // Fetch live data after connect
      await fetchBalances(address)
      await fetchTransactions(address)
    } catch (err: any) {
      setWallet(prev => ({
        ...prev,
        loading: false,
        connected: false,
        error: err.message || 'Connection failed',
        hint: err.message || 'Connection failed. Please check Freighter and try again.',
      }))
    }
  }, [fetchBalances, fetchTransactions, signerRef])

  const disconnect = useCallback(() => {
    signerRef.current = null
    setWallet({
      publicKey: null,
      connected: false,
      network: 'TESTNET',
      walletId: null,
      walletName: null,
      xlmBalance: '0',
      usdcBalance: '0',
      loading: false,
      refreshing: false,
      error: null,
      hint: null,
    })
    setTransactions([])
setTxCursor(null)
    setTxHasMore(false)
  }, [signerRef])

  const refresh = useCallback(async () => {
    if (!wallet.publicKey) return
    setWallet(prev => ({ ...prev, refreshing: true }))
    try {
      await fetchBalances(wallet.publicKey)
      await fetchTransactions(wallet.publicKey)
    } finally {
      setWallet(prev => ({ ...prev, refreshing: false }))
    }
  }, [wallet.publicKey, fetchBalances, fetchTransactions])

  /**
   * Sign an auth entry using the currently connected wallet.
   * This is the only signing operation required by the x402 flow.
   */
  const signAuthEntryWithWallet = useCallback(
    async (authEntryXdr: string, options?: { networkPassphrase?: string }) => {
      if (!wallet.connected || !wallet.walletId) {
        throw new Error('No wallet connected')
      }
      const meta = WALLET(s.find(w => w.id === wallet.walletId)
      if (!meta?.supportsSignAuthEntry) {
        throw new Error(
          `${meta?.name ?? wallet.walletId} does not support signAuthEntry.`
        )
      }
      const signer = signerRef.current ?? getSignerFor(wallet.walletId)
      return signer.signAuthEntry(authEntryXdr, options)
    },
    [wallet.connected, wallet.walletId, signerRef]
  )

  // Auto-check if already connected on mount
  useEffect(() => {
    const check = async () => {
      try {
        const connected = await isConnected()
if (connected.error) {
          throw new Error(connected.error.message)
        }
        if (connected.isConnected) {
          const addr = await getAddress()
          if (addr.address) {
            const net = await getNetwork()
            setWallet(prev => ({
              ...prev,
              publicKey: addr.address,
              connected: true,
              network: net.network || 'TESTNET',
              walletId: 'freighter',
              walletName: 'Freighter',
            }))
            fetchBalances(addr.address)
            fetchTransactions(addr.address)
          }
        }
        if (!connected.isConnected) return

        const addr = await getAddress()
        if (addr.error) throw new Error(addr.error.message)
        if (!addr.address) {
          throw new Error('Unlock Freighter and connect your wallet to continue.')
        }

        const net = await getNetwork()
        if (net.error) throw new Error(net.error.message)

        setWallet(prev => ({
          ...prev,
          publicKey: addr.address,
          connected: true,
          network: net.network || 'TESTNET',
        }))
        fetchBalances(addr.address)
        fetchTransactions(addr.address)
      } catch (err: unknown) {
        setWallet(prev => ({
          ...prev,
          hint: err instanceof Error
            ? err.message
            : 'Could not reconnect to Freighter. Please try connecting again.',
        }))
      }
    }
    check()
  }, [fetchBalances, fetchTransactions])

  return {
    wallet,
    transactions,
    txLoading,
    transactionError,
    txLoadingMore,
    txHasMore,
    loadMoreTransactions,
    connect,
    disconnect,
    refresh,
    signAuthEntryWithWallet,
    wallets: WALLETS,
    supportedWallets: SUPPORTED_WALLETS,
    unsupportedWallets: UNSUPPORTED_WALLETS,
  }
}
