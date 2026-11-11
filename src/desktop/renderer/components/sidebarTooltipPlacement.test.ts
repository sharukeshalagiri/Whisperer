import { describe, expect, it } from 'vitest'

import { placeSidebarTooltip, TRIGGER_GAP, VIEWPORT_MARGIN } from './sidebarTooltipPlacement'

const viewport = { width: 1200, height: 800 }
const tip = { width: 120, height: 28 }

describe('placeSidebarTooltip', () => {
  it('sits right of the trigger and centres vertically', () => {
    const p = placeSidebarTooltip({ left: 12, top: 100, width: 44, height: 36 }, tip, viewport)
    expect(p.side).toBe('right')
    expect(p.left).toBe(12 + 44 + TRIGGER_GAP)
    expect(p.top).toBe(100 + 18 - 14)
    expect(p.arrowTop).toBe(14)
  })

  it('flips left when the right side overflows and the left has room', () => {
    const p = placeSidebarTooltip({ left: 1100, top: 100, width: 40, height: 36 }, tip, viewport)
    expect(p.side).toBe('left')
    expect(p.left).toBe(1100 - TRIGGER_GAP - tip.width)
  })

  it('clamps inside the viewport vertically and keeps the arrow on the trigger', () => {
    const top = placeSidebarTooltip({ left: 12, top: 0, width: 44, height: 20 }, tip, viewport)
    expect(top.top).toBe(VIEWPORT_MARGIN)
    expect(top.arrowTop).toBe(6)
    const bottom = placeSidebarTooltip({ left: 12, top: 790, width: 44, height: 20 }, tip, viewport)
    expect(bottom.top).toBe(800 - VIEWPORT_MARGIN - tip.height)
  })

  it('keeps a wrapped, multi-line bubble fully inside the viewport', () => {
    const wrapped = { width: 260, height: 96 }
    const p = placeSidebarTooltip({ left: 12, top: 780, width: 44, height: 20 }, wrapped, viewport)
    expect(p.top + wrapped.height).toBeLessThanOrEqual(viewport.height - VIEWPORT_MARGIN)
    expect(p.left + wrapped.width).toBeLessThanOrEqual(viewport.width - VIEWPORT_MARGIN)
    expect(p.arrowTop).toBeLessThanOrEqual(wrapped.height - 6)
  })

  it('stays inside the viewport when neither side fits', () => {
    const p = placeSidebarTooltip({ left: 10, top: 100, width: 40, height: 36 }, { width: 300, height: 28 }, { width: 200, height: 800 })
    expect(p.left).toBe(VIEWPORT_MARGIN)
  })
})
