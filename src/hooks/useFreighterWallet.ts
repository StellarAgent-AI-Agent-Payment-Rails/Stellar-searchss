/**
 * useFreighterWallet.ts
 * Real Freighter wallet integration using @stellar/freighter-api
 * Fetches live balances from Stellar Horizon
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  isConnected,
  requestAccess,
  getAddress,
  getNetwork,
} from '@stellar/freighter-api'
import { Horizon } from '@stellar/stellar-sdk'
import { HORIZON_URL, USDC_ISSUER } from '../lib/stellar'

export interface RefreshOptions {
  targetTxHash?: string
  txHash?: string
  expectedPreviousBalance?: string
  maxAttempts?: number
  delayMs?: number
}

export interface WalletState {
  publicKey: string | null
  connected: boolean
  network: string
  xlmBalance: string
  usdcBalance: string
  loading: boolean
  error: string | null
  isRefreshing?: boolean
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

const horizon = new Horizon.Server(HORIZON_URL)

export function useFreighterWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    publicKey: null,
    connected: false,
    network: 'TESTNET',
    xlmBalance: '0',
    usdcBalance: '0',
    loading: false,
    error: null,
  })
  const [transactions, setTransactions] = useState<StellarTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const pollSessionRef = useRef(0)

  // Fetch real balances from Horizon
  const fetchBalances = useCallback(async (publicKey: string) => {
    try {
      const account = await horizon.loadAccount(publicKey)

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

      setWallet(prev => ({
        ...prev,
        xlmBalance: xlm,
        usdcBalance: usdc,
        error: null,
      }))
      return { xlm, usdc }
    } catch (err: any) {
      setWallet(prev => ({
        ...prev,
        error: err.message || 'Failed to load account',
      }))
      return null
    }
  }, [])

  // Fetch real transaction history from Horizon
  const fetchTransactions = useCallback(async (publicKey: string) => {
    setTxLoading(true)
    try {
      const ops = await horizon
        .operations()
        .forAccount(publicKey)
        .order('desc')
        .limit(15)
        .call()

      const txs: StellarTransaction[] = ops.records
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

      setTransactions(txs)
      return txs
    } catch (_) {
      setTransactions([])
      return []
    } finally {
      setTxLoading(false)
    }
  }, [])

  // Connect Freighter wallet
  const connect = useCallback(async () => {
    setWallet(prev => ({ ...prev, loading: true, error: null }))

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
      }))
    }
  }, [fetchBalances, fetchTransactions])

  const disconnect = useCallback(() => {
    pollSessionRef.current++
    setWallet({
      publicKey: null,
      connected: false,
      network: 'TESTNET',
      xlmBalance: '0',
      usdcBalance: '0',
      loading: false,
      error: null,
      isRefreshing: false,
    })
    setTransactions([])
  }, [])

  const refresh = useCallback(async (options?: RefreshOptions) => {
    if (!wallet.publicKey) return

    const targetHash = options?.targetTxHash || options?.txHash
    const previousBalance = options?.expectedPreviousBalance
    const shouldPoll = Boolean(targetHash || previousBalance !== undefined)

    if (!shouldPoll) {
      await fetchBalances(wallet.publicKey)
      await fetchTransactions(wallet.publicKey)
      return
    }

    const sessionId = ++pollSessionRef.current
    const maxAttempts = options?.maxAttempts ?? 5
    const delayMs = options?.delayMs ?? 1500

    setWallet(prev => ({ ...prev, isRefreshing: true }))

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
        if (pollSessionRef.current !== sessionId) return

        const balances = await fetchBalances(wallet.publicKey)
        const txs = await fetchTransactions(wallet.publicKey)

        if (pollSessionRef.current !== sessionId) return

        const balanceChanged = previousBalance !== undefined && balances !== null && balances.usdc !== previousBalance
        const txFound = targetHash !== undefined && txs.some(t => t.hash === targetHash)

        if (balanceChanged || txFound) {
          break
        }
      }
    } finally {
      if (pollSessionRef.current === sessionId) {
        setWallet(prev => ({ ...prev, isRefreshing: false }))
      }
    }
  }, [wallet.publicKey, fetchBalances, fetchTransactions])

  // Auto-check if already connected on mount
  useEffect(() => {
    const check = async () => {
      try {
        const connected = await isConnected()
        if (connected.isConnected) {
          const addr = await getAddress()
          if (addr.address) {
            const net = await getNetwork()
            setWallet(prev => ({
              ...prev,
              publicKey: addr.address,
              connected: true,
              network: net.network || 'TESTNET',
            }))
            fetchBalances(addr.address)
            fetchTransactions(addr.address)
          }
        }
      } catch {
        // Freighter not installed, silent fail
      }
    }
    check()
    return () => {
      pollSessionRef.current++
    }
  }, [fetchBalances, fetchTransactions])

  return {
    wallet,
    transactions,
    txLoading,
    connect,
    disconnect,
    refresh,
  }
}
