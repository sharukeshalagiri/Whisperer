import type { MeetingCaptureState, RecordingState, TransformActivity } from './contracts'

/** Persisted edge preference; pixel coordinates are derived from the current display work area. */
export type OverlayDockEdge = 'bottom' | 'left' | 'right'
/** Reference pill dimensions in logical desktop pixels, excluding the pointer hit area. */
export const OVERLAY_PILL_SIZES = {
  resting: { width: 40, height: 8 },
  ready: { width: 50, height: 30 },
  starting: { width: 73, height: 30 },
  handsfree: { width: 102.5, height: 30 },
  'push-to-talk': { width: 73, height: 30 },
  processing: { width: 98, height: 30 },
  error: { width: 91, height: 30 },
  meeting: { width: 63, height: 30 },
  'meeting-processing': { width: 60, height: 30 },
  // Wide enough for "Applying <name>…" with a spinner; longer names are clipped by the label, not the pill.
  transforming: { width: 236, height: 30 },
} as const

/** Wider pill sizes when push to talk or processing carries a cancel button. */
const OVERLAY_CANCEL_SIZES: Partial<Record<keyof typeof OVERLAY_PILL_SIZES, { width: number; height: number }>> = {
  'push-to-talk': { width: 96, height: 30 },
  processing: { width: 121, height: 30 },
}

/** Circular hover actions shown beside the ready pill, in display order. */
export type OverlayAction = 'notetaker' | 'transform' | 'scratchpad'
/** Diameter of one hover action circle and the gap between neighbours. */
export const OVERLAY_ACTION_SIZE = 28
export const OVERLAY_ACTION_GAP = 6
/** Transparent room for the slide-out tooltip on the screen-interior side of the hovered bar. */
const OVERLAY_TOOLTIP_ROOM = { beside: 220, above: 44, minWidth: 340 } as const

/** Whether a dock edge turns the bar 90 degrees so it runs along the screen side. */
export function isVerticalDock(edge: OverlayDockEdge): boolean {
  return edge === 'left' || edge === 'right'
}

/** Lists the hover actions: Notetaker always, then the first transform and scratchpad when available. */
export function overlayHoverActions(options: { quickTransform?: boolean; scratchpad?: boolean } = {}): OverlayAction[] {
  const actions: OverlayAction[] = ['notetaker']
  if (options.quickTransform) actions.push('transform')
  if (options.scratchpad) actions.push('scratchpad')
  return actions
}

/**
 * Returns the pill size for a state.
 *
 * Args:
 *   presentation: Visual state.
 *   options.edge: Dock edge; left and right swap width and height.
 * Returns:
 *   Logical pill width and height.
 */
export function overlayPillSize(presentation: OverlayPresentation, options: { edge?: OverlayDockEdge } = {}): { width: number; height: number } {
  const size = OVERLAY_CANCEL_SIZES[presentation] ?? OVERLAY_PILL_SIZES[presentation]
  return isVerticalDock(options.edge ?? 'bottom') ? { width: size.height, height: size.width } : size
}

/** Inputs shared by main sizing and renderer layout so both agree on the bar geometry. */
export interface OverlayLayoutOptions {
  edge?: OverlayDockEdge
  /** Number of hover actions; they appear only on the ready pill. */
  actions?: number
}

/**
 * Sizes the bar and the native window around it.
 *
 * The stack is the pill, any hover actions and the reference hit padding. While hover actions show,
 * the window also reserves transparent room for tooltips on the side facing the screen interior.
 *
 * Returns:
 *   `stack`, the visible bar with hit padding, and `window`, the native window size.
 */
export function overlayWindowLayout(presentation: OverlayPresentation, options: OverlayLayoutOptions = {}): { stack: { width: number; height: number }; window: { width: number; height: number } } {
  const edge = options.edge ?? 'bottom'
  const vertical = isVerticalDock(edge)
  const pill = overlayPillSize(presentation, { edge })
  const actions = presentation === 'ready' ? options.actions ?? 0 : 0
  const run = actions * (OVERLAY_ACTION_SIZE + OVERLAY_ACTION_GAP)
  const cross = actions ? Math.max(vertical ? pill.width : pill.height, OVERLAY_ACTION_SIZE) : vertical ? pill.width : pill.height
  const stack = vertical
    ? { width: Math.ceil(cross + 12), height: Math.ceil(pill.height + run + 20) }
    : { width: Math.ceil(pill.width + run + 20), height: Math.ceil(cross + 12) }
  if (!actions) return { stack, window: stack }
  const window = vertical
    ? { width: stack.width + OVERLAY_TOOLTIP_ROOM.beside, height: stack.height }
    : { width: Math.max(stack.width, OVERLAY_TOOLTIP_ROOM.minWidth), height: stack.height + OVERLAY_TOOLTIP_ROOM.above }
  return { stack, window }
}

/** Result pop-up dimensions above the pill: a compact notice, or the before/after comparison. */
export const TRANSFORM_POPUP_SIZES = {
  notice: { width: 300, height: 64 },
  expanded: { width: 420, height: 300 },
} as const
/** How long an untouched result notice stays before closing itself. */
export const TRANSFORM_POPUP_TIMEOUT_MS = 6000

/** Visible pill label while a shortcut transform runs. */
export function transformApplyingLabel(name: string): string {
  return `Applying ${name}…`
}
export type OverlayPresentation = keyof typeof OVERLAY_PILL_SIZES

/** Selects the visual state without exposing internal capture-phase strings as UI copy. */
export function overlayPresentation(recording: RecordingState, meeting: MeetingCaptureState | null, hovered: boolean, transform: TransformActivity | null = null): OverlayPresentation {
  if (meeting) return meeting.status === 'stopping' ? 'meeting-processing' : 'meeting'
  // Dictation keeps the pill; a transform only shows while nothing is being recorded.
  if (transform?.phase === 'applying' && ['idle', 'error'].includes(recording.status)) return 'transforming'
  switch (recording.status) {
    case 'starting': return 'starting'
    case 'recording': return recording.mode ?? 'handsfree'
    case 'stopping':
    case 'processing': return 'processing'
    case 'error': return 'error'
    default: return hovered ? 'ready' : 'resting'
  }
}

/** Native window size: the reference hit padding, plus tooltip room only while hover actions show. */
export function overlayWindowSize(presentation: OverlayPresentation, options: OverlayLayoutOptions = {}): { width: number; height: number } {
  return overlayWindowLayout(presentation, options).window
}

/** Maps real amplitude to reference center-bulged bars; zero input stays at the 2 px floor. */
export function waveformHeights(level: number, count = 10, gain = 5): number[] {
  const amplitude = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0
  // Clamp the shared peak before tapering so loud speech cannot flatten every bar to the maximum.
  const peak = Math.min(15, 15 * amplitude * gain)
  return Array.from({ length: count }, (_, index) => {
    const distance = Math.abs((count - 1) / 2 - index)
    const bulge = Math.max(0, 1 - distance * distance / 48)
    return Math.max(2, peak * bulge)
  })
}
