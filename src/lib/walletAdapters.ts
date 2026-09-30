/**
 * walletAdapters.ts
 * Minimal internal signer interface + adapters for supported Stellar wallets.
 *
 * The x402 flow only needs an auth-entry signer, so the interface is
 * deliberately minimal: an address + signAuthEntry. Adapters that cannot
 * sign auth entries are marked as unsupported and excluded from the picker.
 */

import {
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  getAddress as freighterGetAddress,
  getNetwork as freighterGetNetwork,
  signAuthEntry as freighterSignAuthEntry,
} from '@stellar/freighter-api'

/** A minimal signer interface that every wallet adapter implements. */
export interface WalletSigner {
  /** Stable identifier for the wallet (e.g. 'freighter'). */
  id: WalletId
  /** Human-readable name shown in the picker. */
  name: string
  /** Short description of the wallet / install link. */
  description: string
  /** Whether this adapter can sign auth entries. */
  supportsAuthEntry: boolean
  /** Returns true if the wallet is available in this browser. */
  isAvailable: () => Promise<boolean>
  /** Request access and return the public key. */
  connect: () => Promise<string>
  /** Return the currently authorized address, if any. */
  getAddress: () => Promise<string | null>
  /** Return the current network name (e.g. 'TESTNET'). */
  getNetwork: () => Promise<string>
  /** Sign a base64-encoded auth entry XDR. */
  signAuthEntry: (xdr: string, opts?: { address?: string }) => Promise<string>
}

export type WalletId = 'freighter' | 'albedo' |'xbull' | 'lobstr' | 'rabet' | 'ledger'

/** Metadata for a wallet that cannot sign auth entries. */
export interface UnsupportedWallet {
  id: WalletId
  name: string
  reason: string
}

/**
 * Which wallets support signAuthEntry?
 *
 * - Freighter: yes (signAuthEntry exported by the API).
 * - Albedo: yes (signs auth entries via the Albedo extension API).
 * - xBull: yes (signs auth entries via the xBull extension API).
 * - Lobstr: no (currently exposes only transaction signing, not auth entries).
 * - Rabet: no (currently exposes only transaction signing, not auth entries).
 * - Ledger: no (hardware signing of auth entries is not exposed by the bridge).
 */
export const UNSUPPORTED_WALLETS: UnsupportedWallet[] = [
  {
    id: 'lobstr',
    name: 'Lobstr',
    reason: 'Lobstr does not expose auth-entry signing.',
  },
  {
    id: 'rabet',
    name: 'Rabet',
    reason: 'Rabet does not expose auth-entry signing.',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    reason: 'Ledger does not expose auth-entry signing through the bridge.',
  },
]

/* ------------------------------------------------------------------------- */
/* Freighter adapter (implemented first)                            */
/* ------------------------------------------------------------------------- */

const freighterAdapter: WalletSigner = {
  id: 'freighter',
  name: 'Freighter',
  description: 'Browser extension from Stellar Development Foundation.',
  supportsAuthEntry: true,

  isAvailable: async () => {
    try {
      const res = await freighterIsConnected()
      return Boolean(res.isConnected)
    } catch {
      return false
    }
  },

  connect: async () => {
    const available = await freighterAdapter.isAvailable()
    if (!available) {
      throw new Error('Freighter extension not found. Install it from freighter.app')
    }

    const accessResult = await freighterRequestAccess()
    if (accessResult.error) {
      throw new Error(accessResult.error.message)
    }

    const addressResult = await freighterGetAddress()
    if (addressResult.error || !addressResult.address) {
      throw new Error('Could not get wallet address')
    }

    return addressResult.address
  },

  getAddress: async () => {
    try {
      const res = await freighterGetAddress()
      if (res.error || !res.address) return null
      return res.address
    } catch {
      return null
    }
  },

  getNetwork: async () => {
    try {
      const res = await freighterGetNetwork()
      return res.network || 'TESTNET'
    } catch {
      return 'TESTNET'
    }
  },

  signAuthEntry: async (xdr, opts) => {
    const res = await freighterSignAuthEntry(xdr, {
      address: opts?.address,
    } as any)
    if ((res as any).error) {
      throw new Error((res as any).error.message)
    }
    const signed = (res as any).signedAuthEntry || (res as any).signedAuthEntryX
    if (!signed) throw new Error('Freighter did not return a signed auth entry')
    return signed
  },
}

/* ------------------------------------------------------------------------- */
/* Albedo adapter                                                 */
/* ------------------------------------------------------------------------- */

interface AlbedoApi {
  isAvailable: () => Promise<boolean>
  connect: () => Promise<{ publicKey?: string }>
  getPublicKey: () => Promise<{ publicKey?: string }>
  signAuthEntry: (x: string, opts?: { address?: string }) => Promise<{ signedAuthEntry?: string }>
}

declare global {
  interface Window {
    albedo?: AlbedoApi
  }
}

const albedoAdapter: WalletSigner = {
  id: 'albedo',
  name: 'Albedo',
  description: 'Web wallet with a browser extension bridge.',
  supportsAuthEntry: true,

  isAvailable: async () => {
    try {
      if (typeof window === 'undefined') return false
      const api = window.albedo
      if (!api) return false
      return Boolean(await api.isAvailable())
    } catch {
      return false
    }
  },

  connect: async () => {
    if (typeof window === 'undefined' || !window.albedo) {
      throw new Error('Albedo extension not found. Install it from albedo.link')
    }
    const res = await window.albedo.connect()
    if (!res.publicKey) throw new Error('Albedo did not return a public key')
    return res.publicKey
  },

  getAddress: async () => {
    try {
      if (typeof window === 'undefined' || !window.albedo) return null
      const res = await window.albedo.getPublicKey()
      return res.publicKey || null
    } catch {
      return null
    }
  },

  getNetwork: async () => 'TESTNET',

  signAuthEntry: async (xdr, opts) => {
    if (typeof window === 'undefined' || !window.albedo) {
      throw new Error('Albedo extension not found')
    }
    const res = await window.albedo.signAuthEntry(xdr, { address: opts?.address })
    if (!res.signedAuthEntry) throw new Error('Albedo did not return a signed auth entry')
    return res.signedAuthEntry
  },
}

/* ------------------------------------------------------------------------- */
/* xBull adapter                                                  */
/* ------------------------------------------------------------------------- */

interface xBullApi {
  isConnected: () => Promise<boolean>
  requestAccess: () => Promise<{ address?: string }>
  getAddress: () => Promise<{ address?: string }>
  signAuthEntry: (x: string, opts?: { address?: string }) => Promise<{ signedAuthEntry?: string }>
}

declare global {
  interface Window {
    xbull?: xBullApi
  }
}

const xBullAdapter: WalletSigner = {
  id: 'xbull',
  name: 'xBull',
  description: 'Browser extension with auth-entry signing support.',
  supportsAuthEntry: true,

  isAvailable: async () => {
    try {
      if (typeof window === 'undefined') return false
      const api = window.xbull
      if (!api) return false
      return Boolean(await api.isConnected())
    } catch {
      return false
    }
  },

  connect: async () => {
    if (typeof window === 'undefined' || !window.xbull) {
      throw new Error('xBull extension not found. Install it from xbull.app')
    }
    const res = await window.xbull.requestAccess()
    if (!res.address) throw new Error('xBull did not return an address')
    return res.address
  },

  getAddress: async () => {
    try {
      if (typeof window === 'undefined' || !window.xbull) return null
      const res = await window.xbull.getAddress()
      return res.address || null
    } catch {
      return null
    }
  },

  getNetwork: async () => 'TESTNET',

  signAuthEntry: async (xdr, opts) => {
    if (typeof window === 'undefined' || !window.xbull) {
      throw new Error('xBull extension not found')
    }
    const res = await window.xbull.signAuthEntry(xdr, { address: opts?.address })
    if (!res.signedAuthEntry) throw new Error('xBull did not return a signed auth entry')
    return res.signedAuthEntry
  },
}

/* ------------------------------------------------------------------------- */
/* Registry                                                      */
/* ------------------------------------------------------------------------- */

/** All adapters that can sign auth entries. */
export const SUPPORTED_WALLETS: WalletSigner[] = [
  freighterAdapter,
  albedoAdapter,
  xBullAdapter,
]

export function getWalletAdapter(id: WalletId): WalletSigner | undefined {
  return SUPPORTED_WALLETS.find(w => w.id === id)
}

/** Return adapters that are actually available in this browser. */
export async function getAvailableWallets(): Promise<WalletSigner[]> {
  const checks = await Promise.all(
    SUPPORTED_WALLETS.map(async w => ({ w: w, available: await w.isAvailable() })),
  )
  return checks.filter(c => c.available).map(c => c.w)
}
