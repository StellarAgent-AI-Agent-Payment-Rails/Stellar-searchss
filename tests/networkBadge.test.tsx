import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const ORIGINAL_NETWORK = process.env.STELLAR_NETWORK

async function renderForNetwork(network: 'stellar:testnet' | 'stellar:mainnet') {
  // `src/lib/constants.ts` resolves STELLAR_NETWORK from process.env at import
  // time, so reset the registry and re-import to exercise each branch.
  vi.resetModules()
  process.env.STELLAR_NETWORK = network

  const mod = await import('../src/components/layout/NetworkBadge')

  return {
    badgeHtml: renderToStaticMarkup(React.createElement(mod.NetworkBadge)),
    indicatorHtml: renderToStaticMarkup(React.createElement(mod.MainnetIndicator)),
    testnetStyle: mod.getNetworkBadgeStyle(false),
    mainnetStyle: mod.getNetworkBadgeStyle(true),
  }
}

describe('NetworkBadge', () => {
  afterEach(() => {
    if (ORIGINAL_NETWORK === undefined) {
      delete process.env.STELLAR_NETWORK
    } else {
      process.env.STELLAR_NETWORK = ORIGINAL_NETWORK
    }
    vi.resetModules()
  })

  it('showcases Testnet with the emerald treatment and no page indicator', async () => {
    const { badgeHtml, indicatorHtml } = await renderForNetwork('stellar:testnet')

    expect(badgeHtml).toContain('TESTNET')
    expect(badgeHtml).not.toContain('MAINNET')
    expect(badgeHtml).toContain('data-network="testnet"')
    expect(badgeHtml).toContain('border-emerald-400/40')
    expect(badgeHtml).toContain('text-emerald-300')
    expect(indicatorHtml).toBe('')
  })

  it('showcases Mainnet with the amber warning treatment and a page indicator', async () => {
    const { badgeHtml, indicatorHtml } = await renderForNetwork('stellar:mainnet')

    expect(badgeHtml).toContain('MAINNET')
    expect(badgeHtml).not.toContain('TESTNET')
    expect(badgeHtml).toContain('data-network="mainnet"')
    expect(badgeHtml).toContain('border-neon-amber')
    expect(badgeHtml).toContain('text-neon-amber')
    expect(indicatorHtml).toContain('data-testid="mainnet-indicator"')
    expect(indicatorHtml).toContain('MAINNET ACTIVE · REAL FUNDS')
  })

  it('uses different text and classes for each network', async () => {
    const testnet = await renderForNetwork('stellar:testnet')
    const mainnet = await renderForNetwork('stellar:mainnet')

    expect(mainnet.badgeHtml).not.toBe(testnet.badgeHtml)
    expect(mainnet.mainnetStyle.className).not.toBe(testnet.testnetStyle.className)
    expect(mainnet.mainnetStyle.ariaLabel).not.toBe(testnet.testnetStyle.ariaLabel)
    expect(mainnet.mainnetStyle.network).toBe('mainnet')
    expect(testnet.testnetStyle.network).toBe('testnet')
  })
})
