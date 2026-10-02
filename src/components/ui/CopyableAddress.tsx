import { useState } from 'react'
import { CheckCheck, Copy, ExternalLink } from 'lucide-react'
import { truncateAddress } from '../../lib/stellar'

interface CopyableAddressProps {
  /** Human readable label, e.g. "USDC issuer". */
  label: string
  /** Full address / contract id that gets copied. */
  value: string
  /** Optional explorer link opened by the trailing icon. */
  href?: string
  /** Leading characters kept when the address is truncated. */
  leading?: number
  className?: string
}

/**
 * Renders a labelled Stellar address (issuer or contract) with a copy button and
 * an optional Stellar Expert link. The full value is exposed via `title` and the
 * copy button so it can always be verified without truncation.
 */
export function CopyableAddress({
  label,
  value,
  href,
  leading = 8,
  className = '',
}: CopyableAddressProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API is unavailable in insecure contexts — fail silently.
    }
  }

  return (
    <div className={`flex items-center justify-between gap-3 min-w-0 ${className}`}>
      <span className="font-display text-[10px] tracking-wider uppercase text-white/30 flex-shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-mono text-xs text-white/55 truncate" title={value}>
          {truncateAddress(value, leading)}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
          className="p-1 rounded text-white/30 hover:text-neon-cyan transition-colors flex-shrink-0"
        >
          {copied ? (
            <CheckCheck className="w-3.5 h-3.5 text-neon-green" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${label} on Stellar Expert`}
            title={`View ${label} on Stellar Expert`}
            className="p-1 rounded text-white/30 hover:text-neon-cyan transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}
