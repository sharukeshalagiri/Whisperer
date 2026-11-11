import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FocusEvent, MouseEvent, ReactElement } from 'react'
import { createPortal } from 'react-dom'

import { placeSidebarTooltip } from './sidebarTooltipPlacement'
import type { TooltipPosition } from './sidebarTooltipPlacement'
import './sidebarTooltip.css'

/** Handlers and attributes the tooltip adds to its single child control. */
interface TriggerProps {
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onFocus?: (event: FocusEvent<HTMLElement>) => void
  onBlur?: (event: FocusEvent<HTMLElement>) => void
  'aria-describedby'?: string
  title?: string
}

/** Properties for {@link SidebarTooltip}. */
export interface SidebarTooltipProps {
  /** Text shown beside the control. Keep it equal to, or a refinement of, the control's accessible name. */
  label: string
  /** The one interactive control that owns the tooltip. Its own handlers keep working. */
  children: ReactElement<TriggerProps>
  /** Turns the tooltip off without changing the tree, for example when the label is already visible. */
  disabled?: boolean
}

/** Shows only for keyboard focus, never for the focus a mouse click leaves behind. */
function isKeyboardFocus(target: HTMLElement): boolean {
  try {
    return target.matches(':focus-visible')
  } catch {
    return true
  }
}

/**
 * Wraps one sidebar control and shows its label to the right on hover and keyboard focus.
 *
 * The bubble renders in a portal on `document.body`, positioned with fixed viewport coordinates, so the
 * sidebar's overflow, stacking and `-webkit-app-region: drag` never clip or swallow it. It is
 * `pointer-events: none`, so it cannot steal hover. The control gets `aria-describedby` only while the
 * bubble exists, and any native `title` is removed so the browser never draws a second tooltip. The
 * control keeps its own accessible name. A click on the control (after its own handler runs), Escape, scroll and resize dismiss it; re-entering the pointer or refocusing by keyboard shows it again. Motion is skipped under
 * `prefers-reduced-motion`.
 *
 * Args:
 *   label: Text shown in the bubble.
 *   children: The single control element that triggers it.
 *   disabled: Suppresses the bubble.
 *
 * Returns:
 *   The control, cloned with tooltip behavior, plus a portal while the bubble is open.
 */
export function SidebarTooltip({ label, children, disabled = false }: SidebarTooltipProps): React.JSX.Element {
  const id = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const hovered = useRef(false)
  const focused = useRef(false)
  const open = anchor !== null && !disabled

  const sync = useCallback((target: HTMLElement) => {
    if (hovered.current || focused.current) setAnchor(target)
    else {
      setAnchor(null)
      setPosition(null)
    }
  }, [])

  useLayoutEffect(() => {
    if (!open || !anchor || !bubble.current) return
    const rect = anchor.getBoundingClientRect()
    const size = bubble.current.getBoundingClientRect()
    setPosition(placeSidebarTooltip(rect, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight }))
  }, [open, anchor, label])

  useEffect(() => {
    if (!open) return undefined
    const close = (): void => {
      hovered.current = false
      focused.current = false
      setAnchor(null)
      setPosition(null)
    }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const own = children.props
  const trigger = cloneElement(children, {
    'aria-describedby': open ? [own['aria-describedby'], id].filter(Boolean).join(' ') : own['aria-describedby'],
    title: undefined,
    onMouseEnter: (event) => { own.onMouseEnter?.(event); hovered.current = true; sync(event.currentTarget) },
    onMouseLeave: (event) => { own.onMouseLeave?.(event); hovered.current = false; sync(event.currentTarget) },
    onClick: (event) => { own.onClick?.(event); hovered.current = false; focused.current = false; sync(event.currentTarget) },
    onFocus: (event) => { own.onFocus?.(event); focused.current = isKeyboardFocus(event.currentTarget); sync(event.currentTarget) },
    onBlur: (event) => { own.onBlur?.(event); focused.current = false; sync(event.currentTarget) },
  })

  return <>
    {trigger}
    {open ? createPortal(
      <span className="sidebar-tooltip" data-side={position?.side ?? 'right'} data-ready={position ? 'true' : 'false'} id={id} ref={bubble} role="tooltip" style={position ? { left: position.left, top: position.top, ['--sidebar-tooltip-arrow' as string]: `${position.arrowTop}px` } : undefined}>{label}</span>,
      document.body,
    ) : null}
  </>
}
