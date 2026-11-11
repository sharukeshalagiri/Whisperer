import { useEffect, useState } from 'react'

import type { DesktopPlatform } from '../../../shared/contracts'
import { captureShortcut, normalizeShortcut } from '../../../shared/shortcuts'

let suspensionOwners = 0

/** Scope native suspension to mounted capture/test surfaces, including nested recorders. */
export function useShortcutSuspension(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined
    suspensionOwners += 1
    if (suspensionOwners === 1) void window.whisperer.settings.setShortcutCapture(true)
    return () => {
      suspensionOwners -= 1
      if (suspensionOwners === 0) void window.whisperer.settings.setShortcutCapture(false)
    }
  }, [active])
}

const MAC_LABELS: Record<string, string> = { Control: '⌃ Ctrl', Command: '⌘ Cmd', Super: '⌘ Cmd', Alt: '⌥ Opt', Shift: '⇧ Shift' }
const OTHER_LABELS: Record<string, string> = { Control: 'Ctrl', Command: 'Win', Super: 'Win', Alt: 'Alt', Shift: 'Shift' }

/** Return readable chip labels for a saved chord. */
export function shortcutKeys(value: string, platform: DesktopPlatform): string[] {
  const labels = platform === 'darwin' ? MAC_LABELS : OTHER_LABELS
  return normalizeShortcut(value, platform).split('+').filter(Boolean).map((key) => labels[key] ?? key)
}

/**
 * Tracks keys pressed while a test or capture surface is active, with native actions suspended.
 *
 * Args:
 *   active: Whether to suspend native shortcuts and listen to this window's keys.
 *   platform: Keyboard conventions used for captured chords.
 * Returns:
 *   The chord currently held, or an empty string.
 */
export function useShortcutKeyTest(active: boolean, platform: DesktopPlatform): string {
  const [pressed, setPressed] = useState('')
  useShortcutSuspension(active)
  useEffect(() => {
    if (!active) {
      setPressed('')
      return undefined
    }
    const down = (event: KeyboardEvent): void => {
      const unmodified = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      const interactive = event.target instanceof Element && Boolean(event.target.closest('button,input,select,textarea,a'))
      if (event.key !== 'Tab' && !(unmodified && interactive && ['Enter', ' '].includes(event.key))) event.preventDefault()
      setPressed(captureShortcut(event, platform) ?? '')
    }
    const up = (): void => {
      setPressed('')
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
    }
  }, [active, platform])
  return pressed
}
