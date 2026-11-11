import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Check, CircleDot, Mic, NotebookPen, RotateCcw, Sparkles, Square, WandSparkles, X } from 'lucide-react'

import type { MeetingCaptureState, RecordingMeter, RecordingState, TransformActivity } from '../../../shared/contracts'
import { isVerticalDock, overlayHoverActions, overlayPillSize, overlayPresentation, overlayWindowLayout, transformApplyingLabel, waveformHeights, type OverlayAction, type OverlayDockEdge } from '../../../shared/overlay'
import { formatRecordingDuration } from './format'
import './overlay.css'

export interface RecordingOverlayState extends Pick<RecordingState, 'status' | 'mode'> {
  elapsedMs?: number
  level?: number
  message?: string
  error?: string | null
}

export interface RecordingOverlayProps {
  /** Omit to subscribe to main state; neither mode constructs a microphone provider. */
  state?: RecordingOverlayState
  meeting?: MeetingCaptureState | null
  /** Shortcut transform in progress; omit to follow main state. */
  transform?: TransformActivity | null
  /** First transform offered as a button beside the mic; omit to follow main state. */
  quickTransform?: { id: string; name: string } | null
  onQuickTransform?: () => void
  /** Screen edge the pill is docked to; omit to follow main state. */
  edge?: OverlayDockEdge
  onStartNotetaker?: () => void
  notetakerShortcut?: string
  transformShortcut?: string
  className?: string
  onStart?: () => void
  onStop?: () => void
  onCancel?: () => void
  onStopMeeting?: () => void
  onShowMeeting?: () => void
  dictationShortcut?: string
  finishShortcut?: string
  showScratchpad?: boolean
  scratchpadShortcut?: string | null
  onOpenScratchpad?: () => void
}

/** Eight quiet spokes communicate processing; they never stand in for microphone activity. */
function ProcessingSpinner(): React.JSX.Element {
  return <span aria-hidden="true" className="recording-pill__spinner">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ transform: `rotate(${index * 45}deg) translateY(-6px)`, animationDelay: `${index * -0.1375}s` }} />)}</span>
}

/** Smooths the measured RMS target into ten (or five meeting) bounded center-bulged bars; a vertical bar grows them sideways. */
function Waveform({ active, level, meeting = false, vertical = false }: { active: boolean; level: number; meeting?: boolean; vertical?: boolean }): React.JSX.Element {
  const bars = useRef<Array<HTMLSpanElement | null>>([])
  const target = useRef(level)
  useEffect(() => { target.current = active ? level : 0 }, [active, level])
  useEffect(() => {
    let frame = 0
    let envelope = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const draw = (): void => {
      envelope = reducedMotion ? target.current : envelope * 0.85 + target.current * 0.15
      const snapped = Math.floor(envelope * 100) / 100
      waveformHeights(snapped, meeting ? 5 : 10, meeting ? 2 : 5).forEach((height, index) => {
        bars.current[index]?.style.setProperty(vertical ? 'width' : 'height', `${height}px`)
      })
      frame = window.requestAnimationFrame(draw)
    }
    frame = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frame)
  }, [meeting, vertical])
  return <span aria-hidden="true" className={`recording-pill__waveform${active ? ' is-active' : ''}${meeting ? ' is-meeting' : ''}${vertical ? ' is-vertical' : ''}`}>
    {Array.from({ length: meeting ? 5 : 10 }, (_, index) => <span key={index} ref={(element) => { bars.current[index] = element }} />)}
  </span>
}

/** Names a control in a label that slides out toward the screen interior on hover or keyboard focus. */
function Tip({ label, shortcut }: { label: string; shortcut?: string }): React.JSX.Element {
  return <span aria-hidden="true" className="recording-overlay__tip">
    <span className="recording-overlay__tip-label">{label}</span>
    {shortcut ? <kbd>{shortcut}</kbd> : null}
  </span>
}

/** Presents the provider-free black pill. Capture, insertion and docking remain main/hub-owned. */
export function RecordingOverlay({
  state,
  meeting,
  transform,
  quickTransform,
  onQuickTransform,
  edge,
  onStartNotetaker,
  notetakerShortcut = '',
  transformShortcut = '',
  className,
  onStart,
  onStop,
  onCancel,
  onStopMeeting,
  onShowMeeting,
  dictationShortcut = '',
  finishShortcut = '',
  showScratchpad = false,
  scratchpadShortcut = null,
  onOpenScratchpad,
}: RecordingOverlayProps): React.JSX.Element {
  const [bridgeState, setBridgeState] = useState<RecordingOverlayState>({ status: 'idle' })
  const [bridgeMeeting, setBridgeMeeting] = useState<MeetingCaptureState | null>(null)
  const [bridgeTransform, setBridgeTransform] = useState<TransformActivity | null>(null)
  const [bridgeQuick, setBridgeQuick] = useState<{ id: string; name: string } | null>(null)
  const [bridgeEdge, setBridgeEdge] = useState<OverlayDockEdge>('bottom')
  const [meter, setMeter] = useState<RecordingMeter>({ level: 0, elapsedMs: 0 })
  const [hovered, setHovered] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const gesture = useRef<{ x: number; y: number; moved: boolean; element: HTMLElement; pointer: number } | null>(null)
  const suppressClick = useRef(false)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const leaveTimer = useRef<number | null>(null)
  useEffect(() => () => { if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current) }, [])

  useEffect(() => {
    if (state) return undefined
    return window.whisperer.events.onState((next) => {
      setBridgeState({ status: next.recording.status, mode: next.recording.mode, error: next.recording.error })
      setBridgeMeeting(next.meetingCapture)
      setBridgeTransform(next.transform)
      setBridgeQuick(next.quickTransform)
      setBridgeEdge(next.overlayDockEdge)
    })
  }, [state])
  useEffect(() => {
    const unsubscribeMeter = window.whisperer.events.onRecordingMeter(setMeter)
    const unsubscribeRecording = window.whisperer.events.onRecordingCommand(() => setMeter({ level: 0, elapsedMs: 0 }))
    const unsubscribeMeeting = window.whisperer.events.onMeetingCaptureCommand(() => setMeter({ level: 0, elapsedMs: 0, source: 'meeting' }))
    return () => { unsubscribeMeter(); unsubscribeRecording(); unsubscribeMeeting() }
  }, [])

  const effective = state ?? bridgeState
  const activeMeeting = meeting === undefined ? bridgeMeeting : meeting
  const activeTransform = transform === undefined ? bridgeTransform : transform
  const presentation = overlayPresentation({ ...effective, capturePhase: 'idle', startedAt: null, error: effective.error ?? null }, activeMeeting, hovered, activeTransform)
  const transformLabel = presentation === 'transforming' && activeTransform ? transformApplyingLabel(activeTransform.name) : null
  useEffect(() => {
    if (effective.status !== 'error' || activeMeeting) return undefined
    const timer = window.setTimeout(() => { void window.whisperer.recording.cancel().catch(() => undefined) }, 500)
    return () => window.clearTimeout(timer)
  }, [effective.status, activeMeeting])
  const active = Boolean(activeMeeting ? activeMeeting.status === 'recording' : effective.status === 'recording')
  const processing = activeMeeting ? activeMeeting.status === 'stopping' : presentation === 'processing'
  const level = active && (meter.source ?? 'dictation') === (activeMeeting ? 'meeting' : 'dictation') ? meter.level : 0
  const elapsed = formatRecordingDuration(active ? meter.elapsedMs : 0)
  const title = activeMeeting ? (processing ? 'Finishing Notetaker…' : 'Show Note')
    : effective.status === 'recording' ? (finishShortcut ? `Press ${finishShortcut} to finish and paste` : 'Finish and paste')
      : effective.status === 'error' ? (effective.error ?? 'Dictation could not be completed.')
        : processing ? 'Processing…' : `Dictate${dictationShortcut ? ` ${dictationShortcut}` : ''}`

  /** Reports a rejected named action without leaking internal errors into the compact bar. */
  const perform = (action: () => Promise<unknown> | void): void => {
    if (suppressClick.current) { suppressClick.current = false; return }
    setActionError(null)
    void Promise.resolve().then(action).catch(() => setActionError('This action could not be completed. Try again.'))
  }
  const start = onStart ?? (() => window.whisperer.recording.start())
  const stop = onStop ?? (() => window.whisperer.recording.stop())
  const cancel = onCancel ?? (() => window.whisperer.recording.cancel())
  const stopMeeting = onStopMeeting ?? (() => window.whisperer.meetings.capture.stop())
  const showMeeting = onShowMeeting ?? (() => window.whisperer.window.showHub())

  /** A left-pointer gesture can drag the handle or waveform, never an action icon. */
  const beginDrag = (event: PointerEvent<HTMLElement>): void => {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-drag-surface]') : null
    if (event.button !== 0 || !element) return
    suppressClick.current = false
    gesture.current = { x: event.screenX, y: event.screenY, moved: false, element, pointer: event.pointerId }
    element.setPointerCapture(event.pointerId)
    void window.whisperer.overlay.drag('begin').catch(() => undefined)
  }
  /** Main reads its own cursor position; no renderer-supplied window coordinates cross IPC. */
  const moveDrag = (event: PointerEvent<HTMLElement>): void => {
    const current = gesture.current
    if (!current) return
    if (Math.hypot(event.screenX - current.x, event.screenY - current.y) > 5) current.moved = true
    if (current.moved) void window.whisperer.overlay.drag('move').catch(() => undefined)
  }
  /** Releases capture and snaps only an actual drag; a stationary click retains its normal action. */
  const endDrag = (): void => {
    const current = gesture.current
    if (!current) return
    suppressClick.current = current.moved
    gesture.current = null
    if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer)
    void window.whisperer.overlay.drag('end').catch(() => undefined)
    if (current.moved) setHovered(false)
  }

  const statusText = actionError ?? transformLabel ?? (activeMeeting ? (processing ? 'Finishing Notetaker.' : `Notetaker recording ${elapsed}.`) : active ? `Recording ${elapsed}.` : title)
  const quick = quickTransform === undefined ? bridgeQuick : quickTransform
  const runQuick = onQuickTransform ?? (() => window.whisperer.transformations.runQuick())
  const startNotetaker = onStartNotetaker ?? (() => window.whisperer.overlay.startNotetaker())
  const dockEdge = edge ?? bridgeEdge
  const vertical = isVerticalDock(dockEdge)
  // Push-to-talk and processing gain a cancel button; hands-free already has one.
  const cancellable = !activeMeeting && (presentation === 'push-to-talk' || presentation === 'processing')
  const actions = overlayHoverActions({ quickTransform: Boolean(quick), scratchpad: showScratchpad && Boolean(onOpenScratchpad) })
  const size = overlayPillSize(presentation, { edge: dockEdge })
  const stack = overlayWindowLayout(presentation, { edge: dockEdge, actions: actions.length }).stack
  const actionButton = (action: OverlayAction, index: number): React.JSX.Element | null => {
    const style = { animationDelay: `${index * 40}ms` }
    if (action === 'notetaker') return <span className="recording-overlay__slot" key={action} style={style}>
      <button aria-label="Start Notetaker" className="recording-overlay__action" onClick={() => perform(startNotetaker)} type="button"><CircleDot aria-hidden="true" size={15} /></button>
      <Tip label="Start Notetaker" shortcut={notetakerShortcut} />
    </span>
    if (action === 'transform' && quick) return <span className="recording-overlay__slot" key={action} style={style}>
      <button aria-label={`Apply ${quick.name}`} className="recording-overlay__action recording-overlay__action--transform" onClick={() => perform(runQuick)} type="button"><WandSparkles aria-hidden="true" size={14} /></button>
      <Tip label={quick.name} shortcut={transformShortcut} />
    </span>
    if (action === 'scratchpad' && onOpenScratchpad) return <span className="recording-overlay__slot" key={action} style={style}>
      <button aria-label={`Open scratchpad${scratchpadShortcut ? ` (${scratchpadShortcut})` : ''}`} className="recording-overlay__action" onClick={() => perform(onOpenScratchpad)} type="button"><NotebookPen aria-hidden="true" size={14} /></button>
      <Tip label="Open scratchpad" shortcut={scratchpadShortcut ?? undefined} />
    </span>
    return null
  }
  return <aside className={`recording-overlay recording-overlay--${dockEdge}${className ? ` ${className}` : ''}`} aria-label="Dictation status" data-dock-edge={dockEdge} data-recording-status={effective.status}
    onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => {
      gesture.current = null
      suppressClick.current = true
      void window.whisperer.overlay.drag('cancel').catch(() => undefined)
    }}
    onKeyDown={(event) => {
      if (event.key !== 'Escape') return
      if (gesture.current) { gesture.current = null; void window.whisperer.overlay.drag('cancel').catch(() => undefined) }
      else if (!activeMeeting) perform(cancel)
    }}>
    <span aria-live="polite" className="sr-only">{statusText}</span>
    {/* Hover belongs to the visible bar, so the transparent tooltip room never keeps the bar expanded. */}
    <div className="recording-overlay__stack" ref={stackRef} style={{ width: stack.width, height: stack.height }}
      onPointerEnter={() => {
        if (leaveTimer.current !== null) { window.clearTimeout(leaveTimer.current); leaveTimer.current = null }
        if (hovered) return
        setHovered(true)
        void window.whisperer.overlay.setHovered(true).catch(() => undefined)
      }}
      onPointerLeave={() => {
        if (gesture.current) return
        // Resizing the window under a still cursor can report a spurious leave; collapse only if the pointer really left.
        if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
        leaveTimer.current = window.setTimeout(() => {
          leaveTimer.current = null
          if (stackRef.current?.matches(':hover')) return
          setHovered(false)
          void window.whisperer.overlay.setHovered(false).catch(() => undefined)
        }, 120)
      }}>
      {transformLabel ? <div className="recording-pill recording-pill--transforming" style={{ width: size.width, height: size.height }} title={transformLabel}>
        {/* A sweeping sheen and spinner show work in progress; the label names the transform being applied. */}
        <Sparkles aria-hidden="true" className="recording-pill__sparkle" size={13} />
        <span className="recording-pill__label">{transformLabel}</span>
        <ProcessingSpinner />
      </div> : <span className="recording-overlay__slot recording-overlay__slot--pill">
        <div className={`recording-pill recording-pill--${presentation}${processing ? ' is-flushing' : ''}`} style={{ width: size.width, height: size.height }}>
          {presentation === 'handsfree' || cancellable ? <button aria-label={presentation === 'processing' ? 'Cancel transcription' : 'Cancel recording'} className="recording-pill__cancel" onClick={() => perform(cancel)} title={presentation === 'processing' ? 'Cancel transcription' : 'Cancel recording'} type="button"><X aria-hidden="true" size={12} strokeWidth={3} /></button> : null}
          {presentation === 'resting' || presentation === 'ready' ? <button aria-label={title} className="recording-pill__primary" data-drag-surface onClick={() => perform(start)} type="button">{presentation === 'ready' ? <Mic aria-hidden="true" width={12} height={16} /> : null}</button>
            : presentation === 'error' ? <button aria-label="Retry dictation" className="recording-pill__primary" data-drag-surface onClick={() => perform(start)} title={title} type="button"><RotateCcw aria-hidden="true" size={14} /></button>
              : <button aria-label={activeMeeting ? 'Show Note' : effective.status === 'recording' ? 'Finish and paste' : title} className="recording-pill__primary" data-drag-surface onClick={() => perform(activeMeeting ? showMeeting : effective.status === 'recording' ? stop : () => undefined)} title={title} type="button"><Waveform active={active && !processing} level={active ? (state?.level ?? level) : 0} meeting={Boolean(activeMeeting)} vertical={vertical} /></button>}
          {presentation === 'handsfree' ? <button aria-label="Finish and paste" className="recording-pill__finish" onClick={() => perform(stop)} type="button"><Check aria-hidden="true" size={12} strokeWidth={3} /></button> : null}
          {presentation === 'processing' || (activeMeeting && processing) ? <ProcessingSpinner /> : null}
          {activeMeeting && !processing ? <button aria-label="Stop Notetaker" className="recording-pill__meeting-stop" onClick={() => perform(stopMeeting)} type="button"><Square aria-hidden="true" size={7.5} fill="currentColor" /></button> : null}
        </div>
        {presentation === 'ready' ? <Tip label="Dictate" shortcut={dictationShortcut} /> : null}
      </span>}
      {presentation === 'ready' ? actions.map(actionButton) : null}
    </div>
  </aside>
}
