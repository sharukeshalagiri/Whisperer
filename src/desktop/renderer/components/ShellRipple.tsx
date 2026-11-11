import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { shellRippleGeometry } from './shellRippleGeometry'
import type { ShellRippleGeometry } from './shellRippleGeometry'

/** Props for the backend-switch ripple. */
export interface ShellRippleProps {
  /** The backend being switched to; it picks the ripple colour. */
  target: 'device' | 'remote'
  /** Called once when the wave has finished or was cancelled, so the owner can unmount it. */
  onDone: () => void
}

/** The layer's own keyframes span every wave inside it. Their end, not a timer, ends the ripple. */
const LIFETIME_ANIMATION = 'shell-ripple-life'

/** Whether two measurements would draw the same ripple, so resize callbacks do not re-render needlessly. */
function sameGeometry(a: ShellRippleGeometry | null, b: ShellRippleGeometry): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.radius === b.radius && a.band === b.band && a.clipPath === b.clipPath
}

/**
 * A soft water ripple across the outer shell after a backend switch.
 *
 * It must be a direct child of the positioned shell. It starts at the element marked
 * `data-ripple-origin`, grows until its band has passed the farthest shell corner, and is clipped
 * so it never paints over the element marked `data-ripple-exclude`. Everything is measured from
 * live layout and measured again whenever the shell, the page or the origin changes size. The
 * layer ignores the pointer, so every control under it stays usable. The CSS owns the timing.
 */
export function ShellRipple({ onDone, target }: ShellRippleProps): React.JSX.Element {
  const layer = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  const [geometry, setGeometry] = useState<ShellRippleGeometry | null>(null)

  useEffect(() => { done.current = onDone }, [onDone])

  useLayoutEffect(() => {
    const shell = layer.current?.parentElement
    if (!shell) return undefined
    const origin = shell.querySelector<HTMLElement>('[data-ripple-origin]')
    const page = shell.querySelector<HTMLElement>('[data-ripple-exclude]')
    const measure = (): void => {
      const pageRadius = page ? Number.parseFloat(getComputedStyle(page).borderTopLeftRadius) || 0 : 0
      const next = shellRippleGeometry(shell.getBoundingClientRect(), origin?.getBoundingClientRect() ?? null, page?.getBoundingClientRect() ?? null, pageRadius)
      setGeometry((current) => (sameGeometry(current, next) ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const element of [shell, origin, page]) if (element) observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    const element = layer.current
    if (!element) return undefined
    // A cancelled wave (for example once reduced motion hides the layer) must still end the ripple.
    const finish = (event: AnimationEvent): void => { if (event.target === element && event.animationName === LIFETIME_ANIMATION) done.current() }
    element.addEventListener('animationend', finish)
    element.addEventListener('animationcancel', finish)
    return () => {
      element.removeEventListener('animationend', finish)
      element.removeEventListener('animationcancel', finish)
    }
  }, [])

  const style = geometry
    ? ({ '--ripple-x': `${geometry.x}px`, '--ripple-y': `${geometry.y}px`, '--ripple-max': `${geometry.radius}px`, '--ripple-band': `${geometry.band}px`, clipPath: geometry.clipPath } as CSSProperties)
    : ({ visibility: 'hidden' } as CSSProperties)

  return <div aria-hidden="true" className="shell-ripple" data-target={target} ref={layer} style={style}>
    <span className="shell-ripple__breath" />
    <span className="shell-ripple__echo" />
    <span className="shell-ripple__wave" />
  </div>
}
