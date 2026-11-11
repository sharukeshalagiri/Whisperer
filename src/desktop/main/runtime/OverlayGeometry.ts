import type { OverlayDockEdge } from '../../shared/overlay';

/** Logical desktop-pixel coordinates. */
export interface OverlayPosition { x: number; y: number }
/** Logical desktop-pixel dimensions of the overlay window. */
export interface OverlaySize { width: number; height: number }
/** A display work area or the final overlay bounds. */
export interface OverlayBounds extends OverlayPosition, OverlaySize {}

/** Reads the persisted docking edge, treating every other local file value as the bottom default. */
export function parseOverlayDockEdge(value: unknown): OverlayDockEdge {
  return value === 'left' || value === 'right' ? value : 'bottom';
}

/** Returns the reference pill-center target for an edge: 23 px above bottom or 18 px inside a side. */
function dockTarget(edge: OverlayDockEdge, area: OverlayBounds): OverlayPosition {
  if (edge === 'bottom') return { x: area.x + area.width / 2, y: area.y + area.height - 23 };
  return { x: edge === 'left' ? area.x + 18 : area.x + area.width - 18, y: area.y + area.height / 2 };
}

/** Centers a window on the edge target, then clamps it wholly inside the work area. */
export function dockOverlayBounds(edge: OverlayDockEdge, size: OverlaySize, area: OverlayBounds): OverlayBounds {
  const target = dockTarget(edge, area);
  return clampOverlayBounds({ x: target.x - size.width / 2, y: target.y - size.height / 2 }, size, area);
}

/**
 * Docks the visible bar, then grows the window toward the screen interior so the bar never moves
 * when tooltip room is added or removed.
 */
export function dockOverlayWindowBounds(edge: OverlayDockEdge, stack: OverlaySize, window: OverlaySize, area: OverlayBounds): OverlayBounds {
  const bar = dockOverlayBounds(edge, stack, area);
  const position = edge === 'bottom'
    ? { x: bar.x + bar.width / 2 - window.width / 2, y: bar.y + bar.height - window.height }
    : { x: edge === 'left' ? bar.x : bar.x + bar.width - window.width, y: bar.y };
  return clampOverlayBounds(position, window, area);
}

/** Chooses the edge whose docking target is nearest the released pointer. */
export function nearestOverlayDockEdge(point: OverlayPosition, area: OverlayBounds): OverlayDockEdge {
  let edge: OverlayDockEdge = 'bottom';
  let shortest = Infinity;
  for (const candidate of ['bottom', 'left', 'right'] as const) {
    const target = dockTarget(candidate, area);
    const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
    if (distance < shortest) { shortest = distance; edge = candidate; }
  }
  return edge;
}

/** Keeps a dragged window fully visible on its current display work area. */
export function clampOverlayBounds(position: OverlayPosition, size: OverlaySize, area: OverlayBounds): OverlayBounds {
  return {
    x: Math.round(Math.max(area.x, Math.min(position.x, area.x + area.width - size.width))),
    y: Math.round(Math.max(area.y, Math.min(position.y, area.y + area.height - size.height))),
    width: size.width,
    height: size.height,
  };
}
