import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { EXPECTED_WALLET_NETWORK } from '../../lib/stellar'
import { SearchBar } from './SearchBar'

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

const renderSearchBar = (overrides: Partial<ComponentProps<typeof SearchBar>> = {}) =>
  render(
    <SearchBar
      onSearch={vi.fn()}
      isSearching={false}
      walletConnected
      usdcBalance="1"
      walletNetwork={EXPECTED_WALLET_NETWORK}
      {...overrides}
    />,
  )

describe('SearchBar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits a trimmed query', () => {
    const onSearch = vi.fn()
    renderSearchBar({ onSearch })

    fireEvent.change(screen.getByRole('textbox', { name: 'Search query' }), {
      target: { value: '  Stellar payments  ' },
    })
    fireEvent.submit(screen.getByRole('search'))

    expect(onSearch).toHaveBeenCalledOnce()
    expect(onSearch).toHaveBeenCalledWith('Stellar payments')
  })

  it('disables search and explains the wrong-network state', () => {
    renderSearchBar({ walletNetwork: 'stellar:wrong-network' })

    expect(screen.getByRole('textbox', { name: 'Search query' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /USDC/i })).toBeDisabled()
    expect(screen.getByText(/NETWORK MISMATCH/i)).toBeInTheDocument()
  })

  it('blocks a connected wallet with less than the search price', () => {
    const onSearch = vi.fn()
    renderSearchBar({ onSearch, usdcBalance: '0' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Search query' }), {
      target: { value: 'Stellar payments' },
    })
    fireEvent.submit(screen.getByRole('search'))

    expect(onSearch).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith(
      'Low Balance',
      expect.objectContaining({ description: expect.stringContaining('USDC') }),
    )
  })
})
