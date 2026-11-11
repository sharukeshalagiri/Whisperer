import type { DesktopPlatform } from './contracts'

/** Action vocabulary for user-configured desktop shortcuts. */
export const SHORTCUT_ACTIONS = {
  holdToTalk: { label: 'Push to talk', description: 'Hold to say something short.' },
  toggleRecording: { label: 'Hands-free mode', description: 'Dictate hands-free by pressing this hotkey to start and stop.' },
  pressEnter: { label: 'Press Enter', description: 'Trigger Enter with another key to send messages faster.' },
  pasteLastTranscript: { label: 'Paste last transcript', description: 'Paste the last thing you dictated.' },
  copyLastTranscript: { label: 'Copy last transcript', description: 'Copy the last thing you dictated.' },
  scratchpad: { label: 'Open Scratchpad', description: 'Open a new scratchpad.' },
  startMeeting: { label: 'Join meeting / start Notetaker', description: 'Open Notetaker and start recording.' },
  transform: { label: 'Transform', description: 'Generate a proposed replacement for review.' },
  transformView: { label: 'Transform view changes', description: 'View changes in the current Transform proposal.' },
  cancel: { label: 'Cancel', description: 'Dismiss active dictation.' },
} as const
export type ShortcutAction = keyof typeof SHORTCUT_ACTIONS
export type ShortcutBindings = Record<ShortcutAction, string[]>
export const SHORTCUT_ACTION_IDS = Object.keys(SHORTCUT_ACTIONS) as ShortcutAction[]

/** Non-modifier keys both Electron and the native hook can observe; punctuation uses KeyboardEvent.code names. */
export const SHORTCUT_KEY_PATTERN = /^(?:[A-Z0-9]|Space|Enter|Escape|CapsLock|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[0-9]|2[0-4])|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/

const ELECTRON_KEY_NAMES: Record<string, string> = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
}

/** Converts a saved chord into Electron accelerator syntax, which spells punctuation as characters. */
export function electronAccelerator(value: string): string {
  return value.split('+').map((key) => ELECTRON_KEY_NAMES[key] ?? key).join('+')
}

/** Return fresh default bindings; Fn is not observable through the portable native adapter. */
export function defaultShortcutBindings(platform: DesktopPlatform = 'linux'): ShortcutBindings {
  const mac = platform === 'darwin'
  const hold = platform === 'win32' ? 'Control+Super' : 'Control+Alt'
  return {
    holdToTalk: [hold], toggleRecording: [`${hold}+Space`], pressEnter: [],
    pasteLastTranscript: [mac ? 'Control+Command+V' : 'Alt+Shift+Z'],
    copyLastTranscript: [mac ? 'Control+Command+C' : 'Alt+Shift+X'],
    scratchpad: ['Alt+S'], startMeeting: ['Alt+M'], transform: [platform === 'win32' ? 'Super+Alt+1' : 'Alt+1'],
    transformView: [platform === 'win32' ? 'Super+Alt+O' : 'Alt+O'], cancel: ['Escape'],
  }
}

/** Resolve platform aliases and order modifiers so collisions are based on keys, not spelling. */
export function normalizeShortcut(value: string, platform: DesktopPlatform = 'linux'): string {
  const aliases: Record<string, string> = {
    commandorcontrol: platform === 'darwin' ? 'Command' : 'Control', cmdorctrl: platform === 'darwin' ? 'Command' : 'Control',
    ctrl: 'Control', control: 'Control', cmd: 'Command', command: 'Command',
    meta: platform === 'darwin' ? 'Command' : 'Super', super: platform === 'darwin' ? 'Command' : 'Super', win: 'Super',
    alt: 'Alt', option: 'Alt', opt: 'Alt', shift: 'Shift', esc: 'Escape', escape: 'Escape',
    space: 'Space', enter: 'Enter', return: 'Enter', capslock: 'CapsLock',
  }
  const order = ['Control', 'Command', 'Super', 'Alt', 'Shift']
  return value.split('+').filter(Boolean).map((token) => aliases[token.trim().toLowerCase()] ?? (token.length === 1 ? token.toUpperCase() : token.trim()))
    .sort((a, b) => (order.includes(a) ? order.indexOf(a) : 10) - (order.includes(b) ? order.indexOf(b) : 10)).join('+')
}

/** Capture a browser key event without using locale-dependent printable characters. */
export function captureShortcut(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, platform: DesktopPlatform): string | null {
  const tokens: string[] = []
  if (event.ctrlKey) tokens.push('Control')
  if (event.metaKey) tokens.push(platform === 'darwin' ? 'Command' : 'Super')
  if (event.altKey) tokens.push('Alt')
  if (event.shiftKey) tokens.push('Shift')
  if (!['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) {
    const code = event.code
    const key = /^(Key[A-Z]|Digit[0-9])$/.test(code) ? code.replace(/^(Key|Digit)/, '') : code
    if (!SHORTCUT_KEY_PATTERN.test(key)) return null
    tokens.push(key)
  }
  return tokens.length ? normalizeShortcut(tokens.join('+'), platform) : null
}

/** Captures a chord until its first release, rejecting left/right copies of one modifier. */
export class ShortcutCaptureParser {
  private chord = ''
  private readonly modifierCodes = new Map<string, string>()

  /** Creates a parser for one platform's keyboard conventions. */
  constructor(private readonly platform: DesktopPlatform) {}

  /** Adds a key-down event and returns the currently captured chord. */
  down(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
    const captured = captureShortcut(event, this.platform)
    if (!captured) return null
    if (['Control', 'Alt', 'Meta', 'Shift'].includes(event.key)) {
      const previous = this.modifierCodes.get(event.key)
      if (previous && previous !== event.code) {
        this.chord = `${captured}+${event.key === 'Meta' ? this.platform === 'darwin' ? 'Command' : 'Super' : event.key}`
        return this.chord
      }
      this.modifierCodes.set(event.key, event.code)
    }
    if (captured.split('+').length >= this.chord.split('+').filter(Boolean).length) this.chord = captured
    return this.chord
  }

  /** Completes the chord on the first release and clears transient capture state. */
  release(): string | null {
    const chord = this.chord || null
    this.chord = ''
    this.modifierCodes.clear()
    return chord
  }
}

/** Return the other action using the same normalized chord, or null. */
export function shortcutConflict(bindings: ShortcutBindings, action: ShortcutAction, value: string, platform: DesktopPlatform): ShortcutAction | null {
  const normalized = normalizeShortcut(value, platform)
  if (!normalized) return null
  return SHORTCUT_ACTION_IDS.find((id) => id !== action && bindings[id].some((entry) => normalizeShortcut(entry, platform) === normalized)) ?? null
}

/** Shown when a user presses Fn/Globe, which the native shortcut adapter cannot observe. */
export const FN_KEY_UNSUPPORTED = 'The Fn (Globe) key is not supported in shortcuts. Use Control, Option, Command or Shift instead.'

/** Returns whether a key event came from the Fn/Globe key. */
export function isFnKey(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  return event.key === 'Fn' || event.key === 'FnLock' || event.code === 'Fn'
}

/** Validate a newly captured chord; unsupported keys are never silently saved. */
export function validateShortcut(value: string, platform: DesktopPlatform): string | null {
  const chord = normalizeShortcut(value, platform)
  const keys = chord.split('+')
  if (keys.some((key) => /^fn$/i.test(key))) return FN_KEY_UNSUPPORTED
  if (['Control+C', 'Control+V', 'Control+X', 'Control+Z', 'Command+C', 'Command+V', 'Command+X', 'Command+Z', 'Alt+F4', 'Command+Q', 'Control+Alt+Delete'].includes(chord) || /^[A-Z0-9]$/.test(chord)) return `This shortcut is not allowed: ${chord}`
  if (new Set(keys).size !== keys.length) return 'This shortcut is not allowed: duplicate modifier keys'
  if (!keys.some((key) => ['Control', 'Command', 'Super', 'Alt', 'Shift'].includes(key)) && !['Escape', 'CapsLock'].includes(chord)) return 'Shortcut must include a modifier key or a valid mouse button'
  if (keys.length > 4) return 'Shortcut must contain 4 or fewer keys'
  if (keys.some((key) => !['Control', 'Command', 'Super', 'Alt', 'Shift'].includes(key) && !SHORTCUT_KEY_PATTERN.test(key))) return 'This key is not supported by the native shortcut adapter.'
  return null
}

/** Migrate legacy single-shortcut preferences, preserving the selected recording behavior. */
export function migrateShortcutBindings(saved: { shortcut?: string; holdToTalk?: boolean; scratchpadShortcut?: string; shortcutBindings?: ShortcutBindings }, platform: DesktopPlatform = 'linux'): ShortcutBindings {
  const bindings = defaultShortcutBindings(platform)
  if (saved.shortcutBindings) return Object.fromEntries(SHORTCUT_ACTION_IDS.map((id) => [id, [...(saved.shortcutBindings?.[id] ?? bindings[id])]])) as ShortcutBindings
  if (saved.shortcut) {
    const action = saved.holdToTalk ? 'holdToTalk' : 'toggleRecording'
    bindings[action] = [saved.shortcut]
    const other = saved.holdToTalk ? 'toggleRecording' : 'holdToTalk'
    if (shortcutConflict(bindings, action, saved.shortcut, platform) === other) bindings[other] = []
  }
  if (saved.scratchpadShortcut !== undefined) bindings.scratchpad = saved.scratchpadShortcut ? [saved.scratchpadShortcut] : []
  const primary = saved.holdToTalk ? 'holdToTalk' : 'toggleRecording'
  // An old user-owned binding wins over newly introduced defaults for other actions.
  if (saved.shortcut) for (const action of SHORTCUT_ACTION_IDS) {
    if (action !== primary) bindings[action] = bindings[action].filter((value) => normalizeShortcut(value, platform) !== normalizeShortcut(saved.shortcut ?? '', platform))
  }
  if (saved.scratchpadShortcut) for (const action of SHORTCUT_ACTION_IDS) {
    if (action !== primary && action !== 'scratchpad') bindings[action] = bindings[action].filter((value) => normalizeShortcut(value, platform) !== normalizeShortcut(saved.scratchpadShortcut ?? '', platform))
  }
  return bindings
}
