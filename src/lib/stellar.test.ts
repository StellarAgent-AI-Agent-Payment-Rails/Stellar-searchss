import { describe, it, expect, vi } from 'vitest'
import {
  truncateAddress,
  truncateHash,
  explorerTxUrl,
  explorerAccountUrl,
  formatTimeAgo,
} from './stellar'

describe('stellar utilities', () => {
  describe('truncateAddress', () => {
    it('truncates a standard address', () => {
      const addr = 'GAAZI4TCR3TK5OJH2YXV55YPQ3XQJ2J7X7X7X7X7X7X7X7X7X7X7X7X7X7X7'
      expect(truncateAddress(addr)).toBe('GAAZI4...X7X7')
    })

    it('returns empty string for empty input', () => {
      expect(truncateAddress('')).toBe('')
    })

    it('returns empty string for undefined', () => {
      expect(truncateAddress(undefined as any)).toBe('')
    })

    it('allows custom character length', () => {
      const addr = 'GAAZI4TCR3TK5OJH2YXV55YPQ3XQJ2J7X7X7X7X7X7X7X7X7X7X7X7X7X7X7'
      expect(truncateAddress(addr, 10)).toBe('GAAZI4TCR3...X7X7')
    })
  })

  describe('truncateHash', () => {
    it('truncates a standard hash', () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      expect(truncateHash(hash)).toBe('abcdef12...567890')
    })

    it('returns empty string for empty input', () => {
      expect(truncateHash('')).toBe('')
    })

    it('allows custom character length', () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      expect(truncateHash(hash, 12)).toBe('abcdef123456...567890')
    })
  })

  describe('explorerTxUrl', () => {
    it('generates correct transaction URL', () => {
      const hash = 'abcdef1234567890'
      const url = explorerTxUrl(hash)
      expect(url).toContain('/tx/abcdef1234567890')
      expect(url).toContain('stellar.expert')
    })
  })

  describe('explorerAccountUrl', () => {
    it('generates correct account URL', () => {
      const addr = 'GAAZI4TCR3TK5OJH2YXV55YPQ3XQJ2J7X7X7X7X7X7X7X7X7X7X7X7X7X7X7'
      const url = explorerAccountUrl(addr)
      expect(url).toContain('/account/GAAZI4TCR3TK5OJH2YXV55YPQ3XQJ2J7X7X7X7X7X7X7X7X7X7X7X7X7X7X7')
      expect(url).toContain('stellar.expert')
    })
  })

  describe('formatTimeAgo', () => {
    it('formats seconds correctly', () => {
      const now = new Date()
      const thirtySecondsAgo = new Date(now.getTime() - 30000).toISOString()
      expect(formatTimeAgo(thirtySecondsAgo)).toBe('30s ago')
    })

    it('formats minutes correctly', () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
      expect(formatTimeAgo(fiveMinutesAgo)).toBe('5m ago')
    })

    it('formats hours correctly', () => {
      const now = new Date()
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
      expect(formatTimeAgo(threeHoursAgo)).toBe('3h ago')
    })

    it('formats days correctly', () => {
      const now = new Date()
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
      expect(formatTimeAgo(twoDaysAgo)).toBe('2d ago')
    })
  })
})
