import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'

import type { DesktopPlatform } from '../../../shared/contracts'
import { FN_KEY_UNSUPPORTED, isFnKey, ShortcutCaptureParser } from '../../../shared/shortcuts'
import { shortcutKeys, useShortcutSuspension } from './shortcut-keys'
import './shortcut-recorder.css'

/** Renders one chord as readable key chips. */
export function ShortcutChips({ value, platform }: { value: string; platform: DesktopPlatform }): ReactElement {
  return <span className="shortcut-chips">{shortcutKeys(value, platform).map((key) => <kbd className="shortcut-chip" key={key}>{key}</kbd>)}</span>
}

/** Props for one action binding recorder. */
export interface ShortcutRecorderProps {
  /** Human action name used in accessible labels. */
  actionLabel?: string
  /** Saved chord, or empty when unset. */
  value: string
  /** Platform keyboard conventions. */
  platform: DesktopPlatform
  /** Receives a captured chord, or an empty string when removed. */
  onChange: (value: string) => void
  /** Prevents capture and removal. */
  disabled?: boolean
  /** Hides the remove control for required bindings. */
  removable?: boolean
  /** Starts in capture mode, used by the add-another control. */
  autoStart?: boolean
  /** Called when capture is abandoned without a value. */
  onCancel?: () => void
}

/** Captures a chord as chips and commits it on the first key release. */
export function ShortcutRecorder({ actionLabel = 'Dictation', autoStart = false, disabled = false, onCancel, onChange, platform, removable = true, value }: ShortcutRecorderProps): ReactElement {
  const [capturing, setCapturing] = useState(autoStart && !disabled)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string>()
  const root = useRef<HTMLDivElement>(null)
  const draftRef = useRef('')
  const callbacks = useRef({ onChange, onCancel })
  useEffect(() => { callbacks.current = { onChange, onCancel } }, [onChange, onCancel])
  useShortcutSuspension(capturing)

  useEffect(() => {
    if (!capturing) return undefined
    const stop = (commit: string | null): void => {
      setCapturing(false)
      setDraft('')
      draftRef.current = ''
      if (commit) callbacks.current.onChange(commit)
      else callbacks.current.onCancel?.()
    }
    const parser = new ShortcutCaptureParser(platform)
    const down = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (isFnKey(event)) { setNotice(FN_KEY_UNSUPPORTED); return }
      setNotice(undefined)
      const chord = parser.down(event)
      if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && actionLabel !== 'Cancel') return stop(null)
      if (chord && chord.split('+').length >= draftRef.current.split('+').filter(Boolean).length) {
        draftRef.current = chord
        setDraft(chord)
      }
    }
    const up = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (draftRef.current) stop(draftRef.current)
    }
    const pointer = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) stop(null)
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('pointerdown', pointer, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('pointerdown', pointer, true)
    }
  }, [actionLabel, capturing, platform])

  const shown = capturing ? draft : value
  const beginCapture = (): void => { setNotice(undefined); setCapturing(true) }
  return (
    <div className="shortcut-recorder" data-capturing={capturing ? 'true' : 'false'} ref={root}>
      <div className="shortcut-recorder__field-shell">
        <button aria-label={`${capturing ? 'Recording' : 'Change'} ${actionLabel} shortcut`} className="shortcut-recorder__field" disabled={disabled} onClick={beginCapture} type="button">
          {shown ? <ShortcutChips platform={platform} value={shown} /> : <span className="shortcut-recorder__hint">Click to add a shortcut</span>}
        </button>
        {!disabled ? <button aria-label={`Change ${actionLabel} shortcut`} className="shortcut-recorder__icon" onClick={beginCapture} type="button"><Pencil aria-hidden="true" size={15} /></button> : null}
        {!capturing && removable && value && !disabled ? <button aria-label={`Remove ${actionLabel} shortcut`} className="shortcut-recorder__icon" onClick={() => onChange('')} type="button"><Trash2 aria-hidden="true" size={15} /></button> : null}
      </div>
      {notice ? <p className="shortcut-recorder__notice" role="alert">{notice}</p> : null}
    </div>
  )
}
