import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  /**
   * Text shown in the bubble. The bubble is purely decorative and is hidden
   * from assistive tech, so the control itself must carry a real accessible
   * name via `aria-label` / visible text.
   */
  label: string
  children: ReactNode
  side?: Side
}

/** Distance between the trigger and the bubble, in pixels. */
const GAP = 8

/** Minimum distance kept from the edge of the viewport. */
const VIEWPORT_PADDING = 8

/**
 * A tooltip for icon-only controls.
 *
 * Rendered in a portal with fixed positioning so it is never clipped by an
 * ancestor with `overflow: hidden` (the wallet dropdown is one), and it is
 * anchored to the trigger element rather than the wrapper so that triggers
 * which are themselves `position: fixed` still measure correctly.
 *
 * It opens on hover *and* on keyboard focus, and closes on Escape.
 */
export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [trigger, setTrigger] = useState<HTMLElement | null>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)

  // Resolve the trigger from the wrapper's first child when there is one.
  // For `<Tooltip><button className="fixed …"/></Tooltip>` the wrapper is
  // empty in layout terms, so measuring the wrapper would give a 0×0 rect.
  const setWrapper = useCallback((node: HTMLSpanElement | null) => {
    setTrigger(node ? ((node.firstElementChild as HTMLElement | null) ?? node) : null)
  }, [])

  const place = useCallback(() => {
    const bubble = bubbleRef.current
    if (!trigger || !bubble) return

    const anchor = trigger.getBoundingClientRect()
    const box = bubble.getBoundingClientRect()

    let top: number
    let left: number

    if (side === 'bottom') {
      top = anchor.bottom + GAP
      left = anchor.left + anchor.width / 2 - box.width / 2
    } else if (side === 'left') {
      top = anchor.top + anchor.height / 2 - box.height / 2
      left = anchor.left - box.width - GAP
    } else if (side === 'right') {
      top = anchor.top + anchor.height / 2 - box.height / 2
      left = anchor.right + GAP
    } else {
      top = anchor.top - box.height - GAP
      left = anchor.left + anchor.width / 2 - box.width / 2
    }

    // Keep the bubble fully on screen.
    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - box.width - VIEWPORT_PADDING)
    const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - box.height - VIEWPORT_PADDING)
    left = Math.min(Math.max(left, VIEWPORT_PADDING), maxLeft)
    top = Math.min(Math.max(top, VIEWPORT_PADDING), maxTop)

    setPos({ top, left })
  }, [trigger, side])

  // Native listeners instead of JSX props: keeps the wrapper a plain <span>
  // so `jsx-a11y/no-static-element-interactions` stays satisfied, and
  // `pointerenter` fires correctly on a trigger that is itself `position: fixed`.
  useEffect(() => {
    if (!trigger) return

    const show = () => setOpen(true)
    const hide = () => {
      setOpen(false)
      setPos(null)
    }

    trigger.addEventListener('pointerenter', show)
    trigger.addEventListener('pointerleave', hide)
    trigger.addEventListener('focusin', show)
    trigger.addEventListener('focusout', hide)

    return () => {
      trigger.removeEventListener('pointerenter', show)
      trigger.removeEventListener('pointerleave', hide)
      trigger.removeEventListener('focusin', show)
      trigger.removeEventListener('focusout', hide)
    }
  }, [trigger])

  // Escape closes the bubble.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      setPos(null)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Measure as soon as it opens, and keep it glued to the trigger.
  useLayoutEffect(() => {
    if (!open) return

    place()
    // `true` captures scrolling in nested containers (e.g. the tx list).
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)

    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  return (
    // `display: contents` keeps the wrapper out of layout entirely, so the
    // trigger stays exactly the same flex/grid item (or free-floating) node it
    // was before being wrapped. Without it the wrapper would introduce a new
    // flex item, and around a `position: fixed` trigger it would add a stray
    // line box. The wrapper is only here to host a ref.
    <span ref={setWrapper} className="contents">
      {children}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={bubbleRef}
            role="presentation"
            aria-hidden="true"
            className="fixed z-[100] pointer-events-none whitespace-nowrap rounded-md px-2 py-1 font-display text-[10px] tracking-wider text-white/85 shadow-lg"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              opacity: pos ? 1 : 0,
              background: 'rgba(6,13,20,0.96)',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
              transition: 'opacity 120ms ease',
            }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}
