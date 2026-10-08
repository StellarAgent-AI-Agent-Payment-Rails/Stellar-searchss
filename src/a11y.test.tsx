import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import allowlist from '../a11y-allowlist.json'
import { SearchPage } from './pages/SearchPage'
import { DocsPage } from './pages/DocsPage'
import { DashboardPage } from './pages/DashboardPage'
import type { SearchSession } from './hooks/useSearch'
import type { WalletState } from './hooks/useFreighterWallet'

type PageName = keyof typeof allowlist

async function expectNoUnlistedCriticalViolations(page: PageName, container: HTMLElement) {
  const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } })
  const tracked = new Set<string>(allowlist[page])
  const violations = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      impact: violation.impact,
      signature: `${violation.id}:${node.target.join(',')}`,
      rule: violation.id,
      target: node.target,
    })),
  )
  const unlisted = violations.filter(({ signature }) => !tracked.has(signature))
  expect(unlisted, `untracked accessibility violations on ${page}`).toEqual([])
}

const wallet: WalletState = {
  publicKey: null,
  connected: false,
  network: 'stellar:testnet',
  xlmBalance: '0',
  usdcBalance: '0',
  usdcTrustline: null,
  fundingRequired: false,
  loading: false,
  refreshing: false,
  error: null,
  hint: null,
}

const session: SearchSession = {
  query: '',
  results: [],
  txHash: null,
  paidAmount: null,
  status: 'idle',
  suggestions: [],
}

describe('page accessibility smoke checks', () => {
  it('checks the search page', async () => {
    const { container } = render(
      <SearchPage wallet={wallet} onConnectWallet={() => undefined} session={session} search={async () => undefined} reset={() => undefined} retry={async () => undefined} onNavigateFundingGuide={() => undefined} />,
    )
    await expectNoUnlistedCriticalViolations('search', container)
  })

  it('checks the documentation page', async () => {
    const { container } = render(<DocsPage />)
    await expectNoUnlistedCriticalViolations('docs', container)
  })

  it('checks the dashboard page', async () => {
    const { container } = render(
      <DashboardPage transactions={[]} txLoading={false} publicKey={null} usdcBalance="0" xlmBalance="0" onRefresh={() => undefined} hasMore={false} onLoadMore={() => undefined} loadingMore={false} />,
    )
    await expectNoUnlistedCriticalViolations('dashboard', container)
  })
})
