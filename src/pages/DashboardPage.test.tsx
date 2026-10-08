import type { ComponentProps, ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import type { StellarTransaction } from '../hooks/useFreighterWallet'

// Exercise the dashboard's state transitions without relying on jsdom layout
// measurements. The browser fixture uses the real Recharts implementation.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
  BarChart: ({ data }: { data: unknown[] }) => <div data-testid="chart" data-points={JSON.stringify(data)} />,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}))

type Props = ComponentProps<typeof DashboardPage>

const transaction = (asset: string, amount = '1.25'): StellarTransaction => ({
  id: `${asset}-${amount}`,
  hash: `${asset}-${amount}`,
  type: 'payment',
  amount,
  asset,
  from: 'sender',
  to: 'recipient',
  timestamp: '2026-10-08T12:00:00Z',
})

const props = (overrides: Partial<Props> = {}): Props => ({
  transactions: [],
  txLoading: false,
  publicKey: 'GTESTACCOUNT',
  usdcBalance: '10.00',
  xlmBalance: '20.00',
  onRefresh: vi.fn(),
  ...overrides,
})

const chartRegion = () => within(screen.getByRole('region', { name: 'USDC SPENT OVER TIME' }))

beforeEach(() => vi.clearAllMocks())

describe('Dashboard USDC chart states', () => {
  it.each([
    { name: 'zero transactions', transactions: [] },
    { name: 'XLM-only transactions', transactions: [transaction('XLM', '50')] },
  ])('shows an explicit empty state for $name', ({ transactions }) => {
    render(<DashboardPage {...props({ transactions })} />)
    expect(chartRegion().getByRole('status', { name: 'No USDC activity' })).toBeInTheDocument()
    expect(chartRegion().queryByTestId('chart')).not.toBeInTheDocument()
    expect(chartRegion().queryByRole('status', { name: 'Loading USDC activity' })).not.toBeInTheDocument()
  })

  it.each([
    { name: 'initial load', transactions: [] },
    { name: 'refresh with cached data', transactions: [transaction('USDC')] },
  ])('shows loading instead of empty or stale chart data during $name', ({ transactions }) => {
    render(<DashboardPage {...props({ transactions, txLoading: true, transactionError: 'Previous failure' })} />)
    expect(chartRegion().getByRole('status', { name: 'Loading USDC activity' })).toBeInTheDocument()
    expect(chartRegion().queryByRole('status', { name: 'No USDC activity' })).not.toBeInTheDocument()
    expect(chartRegion().queryByText('USDC ACTIVITY UNAVAILABLE')).not.toBeInTheDocument()
    expect(chartRegion().queryByTestId('chart')).not.toBeInTheDocument()
  })

  it.each([
    { name: 'no cached transactions', transactions: [] },
    { name: 'cached USDC transactions', transactions: [transaction('USDC')] },
  ])('does not misreport a failed request with $name as empty or current data', ({ transactions }) => {
    render(<DashboardPage {...props({ transactions, transactionError: 'Horizon is unavailable' })} />)
    expect(chartRegion().getByText('USDC ACTIVITY UNAVAILABLE')).toBeInTheDocument()
    expect(chartRegion().queryByRole('status', { name: 'No USDC activity' })).not.toBeInTheDocument()
    expect(chartRegion().queryByTestId('chart')).not.toBeInTheDocument()
    expect(within(screen.getByRole('alert')).getByText('Horizon is unavailable')).toBeInTheDocument()
  })

  it('retries through the existing transactions callback', () => {
    const onRetryTransactions = vi.fn()
    const onRefresh = vi.fn()
    render(<DashboardPage {...props({ transactionError: 'Failed', onRetryTransactions, onRefresh })} />)
    fireEvent.click(chartRegion().getByRole('button', { name: 'Retry loading USDC activity' }))
    expect(onRetryTransactions).toHaveBeenCalledOnce()
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('falls back to dashboard refresh when no dedicated retry callback is provided', () => {
    const onRefresh = vi.fn()
    render(<DashboardPage {...props({ transactionError: 'Failed', onRefresh })} />)
    fireEvent.click(chartRegion().getByRole('button', { name: 'Retry loading USDC activity' }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('keeps the loaded USDC chart and excludes XLM transactions', () => {
    render(<DashboardPage {...props({ transactions: [transaction('USDC'), transaction('USDC', '0.50'), transaction('XLM', '50')] })} />)
    const points = JSON.parse(chartRegion().getByTestId('chart').getAttribute('data-points')!)
    expect(points).toEqual([{ date: expect.any(String), amount: 1.75 }])
    expect(chartRegion().queryByRole('status')).not.toBeInTheDocument()
  })

  it('updates the same chart region as loading succeeds, gains data, and fails', () => {
    const base = props()
    const { rerender } = render(<DashboardPage {...base} txLoading />)
    expect(chartRegion().getByRole('status', { name: 'Loading USDC activity' })).toBeInTheDocument()
    rerender(<DashboardPage {...base} />)
    expect(chartRegion().getByRole('status', { name: 'No USDC activity' })).toBeInTheDocument()
    rerender(<DashboardPage {...base} transactions={[transaction('USDC')]} />)
    expect(chartRegion().getByTestId('chart')).toBeInTheDocument()
    rerender(<DashboardPage {...base} transactionError="Failed" />)
    expect(chartRegion().getByText('USDC ACTIVITY UNAVAILABLE')).toBeInTheDocument()
  })

  it('does not display a chart for a disconnected wallet', () => {
    render(<DashboardPage {...props({ publicKey: null, transactions: [transaction('USDC')] })} />)
    expect(screen.queryByRole('region', { name: 'USDC SPENT OVER TIME' })).not.toBeInTheDocument()
  })
})
