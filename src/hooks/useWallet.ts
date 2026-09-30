/**
 * useWallet.ts
 * Wallet-agnostic hook built on the minimal WalletSigner interface.
 *
 * This hook drives the connect flow and exposes the same shape as the
 * legacy useFreighterWallet hook so consumers can migrate without changes.
 */

import { useState, useCallback, useEffect } from 'react'
import { Horizon } from '@stellar/stellar-sdk'
import { HORIZON_URL, USDB_ISSUER } from '../lib/stellar'
import {
  SUPPORTED_WALLETS,
  UNSUPPORTED_WALLETS,
  getAvailableWallets,
  type WalletId,
  type WalletSigner,
} from '../lib/walletAdapters'

export interface WalletState {
  publicKey: string | null
  connected: boolean
  walletId: WalletId | null
  walletName: string | null
  network: string
  xlmBalance: string
  usdcBalance: string
  loading: boolean
  error: string | null
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

const EMPTY_WALLET: WalletState = {
  publicKey: null,
  connected: false,
  walletId: null,
  walletName: null,
  network: 'TESTNET',
  xlmBalance: '0',
  usdcBalance: '0',
  loading: false,
  error: null,
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET)
  const [transactions, setTransactions] = useState<StellarTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [adapter, setAdapter] = useState<WalletSigner | null>(null)
  const [availableWallets, setAvailableWallets] = useState<WalletSigner[]>([])

  // Discover which wallets are installed in this browser.
  useEffect(() => {
    let cancelled = false
    getAvailableWallets().then(ws => {
      if (!cancelled) setAvailableWallets(ws)
    })
    return () => {
      cancelled = true
    }
  }, [])

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
          (balance as any).asset_issuer === USDB_ISSUER
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
    } catch (err: any) {
      setWallet(prev => ({
        ...prev,
        error: err.message || 'Failed to load account',
      }))
    }
  }, [])

  const fetchTransactions = useCallback(async (publicKey: string) => {
    setTxLoading(true)
    try {
      const ops = await horizon
        .operations()
        .forAccount(publicKey)
        .order('desc')
        .limit(15)
        .call()

      const txs = ops.records
        .filter((op: any) => op.type === 'payment' || op.type === 'create_account')
        .map((op: any) => ({
          id: op.id,
          hash: op.transaction_hash,
          type: op.type,
          amount: op.amount ? parseFloat(op.amount).toFixed(4) : '—',
          asset: op.asset_type === 'native' ? 'XLM' : op.asset_code || 'Unknown',
          from: op.from || op.funder || '',
          to: op.to || op.account || '',
          timestamp: op.created_at,
          memo: op.transaction?.memo,
        }))

      setTransactions(txs)
    } catch (_) {
      setTransactions([])
    } finally {
      setTxLoading(false)
    }
  }, [])

  const connect = useCallback(async (walletId?: WalletId) => {
    setWallet(prev => ({ ...prev, loading: true, error: null }))

    try {
      const target = walletId ? SUPPORTED_WALLETS.find(w => w.id === walletId) : adapter
      if (!target) {
        throw new Error('No wallet selected')
      }
      if (!target.supportsAuthEntry) {
        throw new Error(`${target.name} does not support auth-entry signing`)
      }

      const address = await target.connect()
      const network = await target.getNetwork()

      setAdapter(target)
      setWallet(prev => ({
        ...prev,
        publicKey: address,
        connected: true,
        walletId: target.id,
        walletName: target.name,
        network,
        loading: false,
        error: null,
      }))

      await fetchBalances(address)
      await fetchTransactions(address)
    } catch (err: any) {
      setWallet(prev => (
        {
          ...prev,
          loading: false,
          connected: false,
          error: err.message || 'Connection failed',
        }))
    }
  }, [adapter, fetchBalances, fetchTransactions])

  const disconnect = useCallback(() => {
    setAdapter(null)
    setWallet(EMPTY_WALLET)
    setTransactions([])
  }, [])

  const refresh = useCallback(async () => {
    if (wallet.publicKey) {
      await fetchBalances(wallet.publicKey)
      await fetchTransactions(wallet.publicKey)
    }
  }, [wallet.publicKey, fetchBalances, fetchTransactions])

  /** Sign a base64-encoded auth entry with the currently connected wallet. */
  const signAuthEntry = useCallback(
    async (xdr: string): Promise<string> => {
      if (!adapter || !wallet.publicKey) {
        throw new Error('Wallet not connected')
      }
      if (!adapter.supportsAuthEntry) {
        throw new Error(`${adapter.name} does not support auth-entry signing`)
      }
      return adapter.signAuthEntry(xdr, { address: wallet.publicKey })
    },
    [adapter, wallet.publicKey],
  )

  // Auto-reconnect to a wallet that is already authorized.
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      for (const w of SUPPORTED_WALLETS) {
        try {
          if (!(await w.isAvailable())) continue
          const addr = await w.getAddress()
          if (!addr) continue
          const net = await w.getNetwork()
          if (cancelled) return
          setAdapter(w)
          setWallet(prev => ({
            ...prev,
            publicKey: addr,
            connected: true,
            walletId: w.id,
            walletName: w.name,
            network,
          }))
          fetchBalances(addr)
          fetchTransactions(addr)
          return
        } catch {
          // Wallet not authorized or not installed; try the next one.
        }
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [fetchBalances, fetchTransactions])

  return {
    wallet,
    transactions,
    txLoading,
    connect,
    disconnect,
    refresh,
    signAuthEntry,
    availableWallets,
    unsupportedWallets: UNSUPPORTED_WALLETS,
  }
}
