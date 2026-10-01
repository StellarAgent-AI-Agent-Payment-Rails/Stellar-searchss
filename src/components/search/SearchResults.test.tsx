import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SearchResults } from './SearchResults'
import type { SearchResult } from '../../hooks/useSearch'

const result: SearchResult = {
  id: 'result-1',
  title: 'Stellar payment rails',
  url: 'https://example.com/stellar-payments',
  description: 'A guide to building payment flows on Stellar.',
  source: 'example.com',
  relevanceScore: 0.92,
}

describe('SearchResults', () => {
  it('renders no result cards for an empty result set', () => {
    const { container } = render(<SearchResults results={[]} query="Stellar" />)
    expect(container.firstChild).toBeNull()
  })

  it('exposes a loading status while results are being fetched', () => {
    render(<SearchResults results={[]} query="Stellar" isLoading />)
    expect(screen.getByRole('status', { name: 'Loading search results' })).toBeInTheDocument()
  })

  it('renders populated results with their title and description', () => {
    render(<SearchResults results={[result]} query="Stellar" />)
    expect(screen.getByRole('heading', { name: result.title })).toBeInTheDocument()
    expect(screen.getByText(result.description)).toBeInTheDocument()
    expect(screen.getByRole('article', { name: result.title })).toHaveAttribute('href', result.url)
  })
})
