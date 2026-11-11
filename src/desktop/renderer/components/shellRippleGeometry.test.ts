import { describe, expect, it } from 'vitest'

import { RIPPLE_BAND, shellRippleGeometry } from './shellRippleGeometry'

const shell = { left: 0, top: 0, width: 1200, height: 800 }
const toggle = { left: 1000, top: 16, width: 60, height: 20 }
const page = { left: 216, top: 52, width: 975, height: 739 }

describe('shell ripple geometry', () => {
  it('starts at the centre of the toggle', () => {
    const geometry = shellRippleGeometry(shell, toggle, page, 24)
    expect(geometry.x).toBe(1030)
    expect(geometry.y).toBe(26)
  })

  it('sizes the ring so its visible band clears the farthest shell corner', () => {
    const geometry = shellRippleGeometry(shell, toggle, page, 24)
    const farthest = Math.hypot(1030, 800 - 26)
    expect(geometry.band).toBe(RIPPLE_BAND)
    expect(geometry.radius - geometry.band).toBeGreaterThanOrEqual(farthest)
    expect(geometry.radius - geometry.band).toBeLessThan(farthest + 1)
  })

  it('measures relative to a shell that is not at the viewport origin', () => {
    const offset = shellRippleGeometry({ ...shell, left: 40, top: 30 }, { ...toggle, left: 1040, top: 46 }, { ...page, left: 256, top: 82 }, 24)
    expect(offset).toEqual(shellRippleGeometry(shell, toggle, page, 24))
  })

  it('cuts the rounded page out of the shell with an even-odd path', () => {
    const { clipPath } = shellRippleGeometry(shell, toggle, page, 24)
    expect(clipPath).toBe("path(evenodd, 'M0 0H1200V800H0Z M240 52H1167A24 24 0 0 1 1191 76V767A24 24 0 0 1 1167 791H240A24 24 0 0 1 216 767V76A24 24 0 0 1 240 52Z')")
  })

  it('clamps the corner radius to a small page', () => {
    const { clipPath } = shellRippleGeometry(shell, toggle, { left: 100, top: 100, width: 20, height: 10 }, 24)
    expect(clipPath).toContain('A5 5 0 0 1')
  })

  it('falls back to the top centre when the toggle is hidden, and paints everything without a page', () => {
    const geometry = shellRippleGeometry(shell, { left: 0, top: 0, width: 0, height: 0 }, null, 24)
    expect([geometry.x, geometry.y]).toEqual([600, 0])
    expect(geometry.clipPath).toBe('none')
    expect(geometry.radius - geometry.band).toBeGreaterThanOrEqual(Math.hypot(600, 800))
  })
})
