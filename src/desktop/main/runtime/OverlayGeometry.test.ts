import { describe, expect, test } from 'vitest';

import { clampOverlayBounds, dockOverlayBounds, dockOverlayWindowBounds, nearestOverlayDockEdge, parseOverlayDockEdge } from './OverlayGeometry';

const area = { x: 1440, y: 25, width: 1920, height: 1055 };
const size = { width: 123, height: 42 };

describe('OverlayGeometry', () => {
  test('docks centered 23 px above the bottom work-area edge by default', () => {
    expect(dockOverlayBounds('bottom', size, area)).toEqual({ x: 2339, y: 1036, width: 123, height: 42 });
  });

  test('docks vertically centered and clamped inside either side', () => {
    expect(dockOverlayBounds('left', size, area)).toEqual({ x: 1440, y: 532, width: 123, height: 42 });
    expect(dockOverlayBounds('right', size, area)).toEqual({ x: 3237, y: 532, width: 123, height: 42 });
  });

  test('keeps the bar in place and grows the window toward the screen interior', () => {
    const stack = { width: 42, height: 120 };
    const window = { width: 262, height: 120 };
    expect(dockOverlayWindowBounds('right', stack, window, area)).toEqual({ x: 3098, y: 493, width: 262, height: 120 });
    expect(dockOverlayWindowBounds('left', stack, window, area)).toEqual({ x: 1440, y: 493, width: 262, height: 120 });
    const bottom = dockOverlayBounds('bottom', size, area);
    expect(dockOverlayWindowBounds('bottom', size, { width: 340, height: 86 }, area)).toEqual({ x: 2231, y: bottom.y - 44, width: 340, height: 86 });
  });

  test('selects the nearest edge target for a released pointer', () => {
    expect(nearestOverlayDockEdge({ x: 2400, y: 1040 }, area)).toBe('bottom');
    expect(nearestOverlayDockEdge({ x: 1500, y: 450 }, area)).toBe('left');
    expect(nearestOverlayDockEdge({ x: 3300, y: 700 }, area)).toBe('right');
  });

  test('keeps a moving window inside the display under the pointer', () => {
    expect(clampOverlayBounds({ x: 3400, y: -20 }, size, area)).toEqual({ x: 3237, y: 25, width: 123, height: 42 });
  });

  test('does not reuse stale x/y when the size is an existing window bounds object', () => {
    const oldBounds = { x: 1500, y: 400, ...size };
    expect(clampOverlayBounds({ x: 3400, y: -20 }, oldBounds, area)).toEqual({ x: 3237, y: 25, width: 123, height: 42 });
  });

  test('persists only a known edge, never stale coordinates or malformed values', () => {
    expect(parseOverlayDockEdge('left')).toBe('left');
    expect(parseOverlayDockEdge('right')).toBe('right');
    expect(parseOverlayDockEdge({ x: 10, y: 10 })).toBe('bottom');
    expect(parseOverlayDockEdge('top')).toBe('bottom');
  });
});
