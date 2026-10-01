/**
 * useFreighterWallet.ts
 * Real Freighter wallet integration using @stellar/freighter-api
 * Fetches live balances from Stellar Horizon
 */

import { useState, useCallback, useEffect } from 'react'
import {
  isConnected,
  requestAccess,
  getAddress,
  getNetwork,
} from '@stellar/freighter-api'
import { Horizon } from '@stellar/stellar-sdk'
import { HORIZON_URL, USDC_ISSUER } from '../lib/stellar'

export interface WalletState {
  publicKey: string | null
  connected: boolean
  network: string
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
    xlmBalance: '0',
    usdcBalance: '0',
    loading: false,
    refreshing: false,
    error: null,
    hint: null,
  })
  const [transactions, setTransactions] = useState<StellarTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
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

  // Connect Freighter wallet
  const connect = useCallback(async () => {
    setWallet(prev => ({ ...prev, loading: true, error: null, hint: null }))

    try {
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

      const networkResult = await getNetwork()
      const network = networkResult.network || 'TESTNET'

      setWallet(prev => ({
        ...prev,
        publicKey: addressResult.address,
        connected: true,
        network,
        loading: false,
        error: null,
      }))

      // Fetch live data after connect
      await fetchBalances(addressResult.address)
      await fetchTransactions(addressResult.address)
    } catch (err: any) {
      setWallet(prev => ({
        ...prev,
        loading: false,
        connected: false,
        error: err.message || 'Connection failed',
        hint: err.message || 'Connection failed. Please check Freighter and try again.',
      }))
    }
  }, [fetchBalances, fetchTransactions])

  const disconnect = useCallback(() => {
    setWallet({
      publicKey: null,
      connected: false,
      network: 'TESTNET',
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
  }, [])

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

  // Auto-check if already connected on mount
  useEffect(() => {
    const check = async () => {
      try {
        const connected = await isConnected()
        if (connected.error) {
          throw new Error(connected.error.message)
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
  }
}
