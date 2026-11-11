/** Pure placement maths for the sidebar tooltip. It has no DOM access so it can be unit tested. */

/** A rectangle in viewport coordinates. */
export interface PlacementRect {
  left: number
  top: number
  width: number
  height: number
}

/** The measured tooltip size. */
export interface PlacementSize {
  width: number
  height: number
}

/** The viewport the tooltip must stay inside. */
export interface PlacementViewport {
  width: number
  height: number
}

/** Where to draw the tooltip, and which side of the trigger it landed on. */
export interface TooltipPosition {
  left: number
  top: number
  side: 'right' | 'left'
  /** Vertical offset of the arrow from the tooltip top, so it keeps pointing at the trigger centre. */
  arrowTop: number
}

/** Distance kept between the tooltip and the viewport edge. */
export const VIEWPORT_MARGIN = 8
/** Distance between the trigger and the tooltip. */
export const TRIGGER_GAP = 10

/**
 * Places a tooltip to the right of its trigger, vertically centred on it. It flips to the left when the
 * right side lacks room and the left side has more, and it clamps inside the viewport on both axes.
 */
export function placeSidebarTooltip(anchor: PlacementRect, tip: PlacementSize, viewport: PlacementViewport, gap = TRIGGER_GAP, margin = VIEWPORT_MARGIN): TooltipPosition {
  const rightLeft = anchor.left + anchor.width + gap
  const leftLeft = anchor.left - gap - tip.width
  const fitsRight = rightLeft + tip.width <= viewport.width - margin
  const fitsLeft = leftLeft >= margin
  const side = fitsRight || !fitsLeft ? 'right' : 'left'
  const rawLeft = side === 'right' ? rightLeft : leftLeft
  const left = Math.max(margin, Math.min(rawLeft, viewport.width - margin - tip.width))
  const centred = anchor.top + anchor.height / 2 - tip.height / 2
  const top = Math.max(margin, Math.min(centred, viewport.height - margin - tip.height))
  const arrowTop = Math.max(6, Math.min(anchor.top + anchor.height / 2 - top, tip.height - 6))
  return { left: Math.round(left), top: Math.round(top), side, arrowTop: Math.round(arrowTop) }
}
