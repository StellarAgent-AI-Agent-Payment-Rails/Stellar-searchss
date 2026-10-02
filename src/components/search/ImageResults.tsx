import React from 'react'

export interface ImageResult {
  id: string | number
  thumbnailUrl: string
  title?: string
  width?: number
  height?: number
  url?: string
}

export interface ImageResultsProps {
  results?: ImageResult[]
  loading?: boolean
  skeletonCount?: number
  onSelect?: (result: ImageResult) => void
}

const graidStyles: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minimax(160px, 1fr))',
  gap: '12px',
  width: '100%',
}

const cellStyles: React.CSSProperties = {
  position: 'relative',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  borderRadius: '8px',
  backgroundColor: '#f3f4f6',
}

const imageStyles: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
}

/**
 * Skeleton block reusing the existing skeleton styling conventions.
 * The animation is defined in the shared stylesheet via the `skeleton` class.
 */
function SkeletonCell() {
  return <div className="skeleton" style={{ ...cellStyles }} aria-hidden="true" />
}

function ImageCell({
  result,
  onSelect,
}: {
  result: ImageResult
  onSelect?: (r: ImageResult) => void
}) {
  const [loaded, setLoaded] = React.useState(false)
  const [imageFailed, setImageFailed] = React.useState(false)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(result)}
      style={{
        ...cellStyles,
        padding: 0,
        border: 'none',
        cursor: onSelect ? 'pointer' : 'default',
        backgroundColor: '#f3f4f6',
      }}
      aria-label={result.title ?? 'Image result'}
    >
      {!loaded && (
        <div
          className="skeleton"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          aria-hidden="true"
        />
      )}
      <img
        src={imageFailed ? '/image-placeholder.svg' : result.thumbnailUrl}
        alt={result.title ?? ''}
        width={result.width}
        height={result.height}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setImageFailed(true)
          setLoaded(true)
        }}
        style={{
          ...imageStyles,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 150ms ease-in-out',
        }}
      />
    </button>
  )
}

export function ImageResults({
  results = [],
  loading = false,
  skeletonCount = 8,
  onSelect,
}: ImageResultsProps) {
  const showSkeleton = loading || results.length === 0

  if (showSkeleton) {
    return (
      <div
        className="image-results-skeleton"
        style={graidStyles}
        role="status"
        aria-liveo="polite"
        aria-label="Loading image results"
      >
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonCell key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="image-results" style={graidStyles}>
      {results.map((result) => (
        <ImageCell result={result} onSelect={onSelect} key={result.id} />
      ))}
    </div>
  )
}

export default ImageResults
