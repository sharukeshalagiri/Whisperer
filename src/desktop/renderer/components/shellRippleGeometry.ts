/** A rectangle in viewport pixels, as returned by `getBoundingClientRect`. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Where the backend-switch ripple starts, how far it reaches and which area it may paint. */
export interface ShellRippleGeometry {
  /** Ripple centre, relative to the shell's top-left corner. */
  x: number
  /** Ripple centre, relative to the shell's top-left corner. */
  y: number
  /** Outer radius of the fully grown ring. Its soft inner edge clears the farthest shell corner. */
  radius: number
  /** Width of the ring's band in pixels. */
  band: number
  /** CSS `clip-path` that keeps the shell and cuts out the rounded page, or `none` without a page. */
  clipPath: string
}

/**
 * Width of the ring's soft band, in pixels. The CSS gradient is transparent inside
 * `radius - band`, so growing the ring to `reach + band` carries the whole band past the farthest
 * corner before it finishes.
 */
export const RIPPLE_BAND = 132

/** Whether a measured box is actually laid out, so a hidden control is never used as the origin. */
export function isVisibleBox(box: Box | null | undefined): box is Box {
  return Boolean(box && box.width > 0 && box.height > 0)
}

/** Formats a pixel value compactly for an SVG path. */
function px(value: number): string {
  return String(Math.round(value * 2) / 2)
}

/**
 * Builds an even-odd path covering the shell with a rounded hole for the page, so the ring paints
 * the top bar, sidebar and gutters but never the page, whatever its size or position.
 */
function shellClipPath(width: number, height: number, page: Box, cornerRadius: number): string {
  const left = page.left
  const top = page.top
  const right = page.left + page.width
  const bottom = page.top + page.height
  const r = Math.max(0, Math.min(cornerRadius, page.width / 2, page.height / 2))
  const arc = `A${px(r)} ${px(r)} 0 0 1`
  const outer = `M0 0H${px(width)}V${px(height)}H0Z`
  const hole = `M${px(left + r)} ${px(top)}H${px(right - r)}${arc} ${px(right)} ${px(top + r)}V${px(bottom - r)}${arc} ${px(right - r)} ${px(bottom)}H${px(left + r)}${arc} ${px(left)} ${px(bottom - r)}V${px(top + r)}${arc} ${px(left + r)} ${px(top)}Z`
  return `path(evenodd, '${outer} ${hole}')`
}

/**
 * Computes the ripple from live layout boxes.
 *
 * Args:
 *   shell: The app shell's box; every result is relative to its top-left corner.
 *   origin: The control the ripple starts from, or null to start at the top centre.
 *   page: The page surface to exclude, or null when no page is laid out.
 *   pageRadius: The page surface's corner radius in pixels.
 *
 * Returns:
 *   The centre, the radius and band that reach past the farthest shell corner, and the clip path.
 */
export function shellRippleGeometry(shell: Box, origin: Box | null, page: Box | null, pageRadius: number): ShellRippleGeometry {
  const width = shell.width
  const height = shell.height
  const x = isVisibleBox(origin) ? origin.left + origin.width / 2 - shell.left : width / 2
  const y = isVisibleBox(origin) ? origin.top + origin.height / 2 - shell.top : 0
  const reach = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y))
  const relativePage = isVisibleBox(page) ? { left: page.left - shell.left, top: page.top - shell.top, width: page.width, height: page.height } : null
  return {
    x,
    y,
    radius: Math.ceil(reach + RIPPLE_BAND),
    band: RIPPLE_BAND,
    clipPath: relativePage ? shellClipPath(width, height, relativePage, pageRadius) : 'none',
  }
}
