import { SHORTCUT_KEY_PATTERN } from '../../shared/shortcuts'
import type { ShortcutRegistration } from './PlatformService'

/** The subset of a native key event needed to recognize an explicitly configured hold shortcut. */
export interface NativeKeyboardEvent {
  readonly keycode: number
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
}

/** A narrowly scoped native keyboard-hook adapter. */
export interface NativeKeyboardHook {
  /** Subscribe to one keyboard-down notification. */
  on(event: 'keydown', listener: (event: NativeKeyboardEvent) => void): this
  /** Subscribe to one keyboard-up notification. */
  on(event: 'keyup', listener: (event: NativeKeyboardEvent) => void): this
  /** Remove one keyboard-down notification. */
  off(event: 'keydown', listener: (event: NativeKeyboardEvent) => void): this
  /** Remove one keyboard-up notification. */
  off(event: 'keyup', listener: (event: NativeKeyboardEvent) => void): this
  /** Begin the native hook after the user explicitly enables hold-to-talk. */
  start(): void
  /** Stop the native hook when hold-to-talk is disabled or the app pauses. */
  stop(): void
}

/** Callbacks invoked only while the registered hold chord transitions state. */
export interface HoldShortcutCallbacks {
  /** Start the current recording when the full configured chord is pressed. */
  readonly onStart: () => void
  /** Stop the current recording when its target or a required modifier is released. */
  readonly onStop: () => void
}

/** A renderer-safe account of whether hold-to-talk can be registered. */
export interface HoldShortcutCapability {
  readonly supported: boolean
  readonly granted: boolean
  readonly reason: string | null
}

/** Dependencies for the native adapter, supplied by the platform boundary or tests. */
export interface HoldShortcutServiceDependencies {
  readonly platform: string
  readonly environment: Readonly<Record<string, string | undefined>>
  /** Reports the macOS accessibility trust state without prompting. */
  readonly isAccessibilityGranted?: () => boolean
  /** Checks package presence without loading the native hook. */
  readonly isInstalled?: () => boolean
  /** Lazily loads the hook and its exported key map only after explicit user opt-in. */
  readonly createNative?: () => NativeHoldLibrary
}

/** The lazily loaded hook and its authoritative key names. */
export interface NativeHoldLibrary {
  readonly hook: NativeKeyboardHook
  readonly keys: Readonly<Record<string, number>>
}

/** One configured native chord and its lifecycle callbacks. */
export interface NativeShortcutBinding {
  readonly accelerator: string
  readonly callbacks: HoldShortcutCallbacks
}

interface ParsedHoldShortcut {
  readonly accelerator: string
  readonly keyName: string
  readonly keycode: number
  modifiers: Readonly<
    Required<Pick<NativeKeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>>
  >
}

/** Parse only a small, key-up-capable Electron accelerator subset for native hold handling. */
function parseHoldShortcut(accelerator: string, platform: string): ParsedHoldShortcut | null {
  const tokens = accelerator
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
  if (!tokens.length) return null
  const modifierNames = /^(commandorcontrol|cmdorctrl|command|cmd|super|meta|control|ctrl|shift|alt|option)$/i
  const keyToken = tokens.length && !modifierNames.test(tokens[tokens.length - 1] ?? "") ? (tokens.pop() ?? "") : ""

  const keyName =
    keyToken.length === 1
      ? keyToken.toUpperCase()
      : ({ escape: "Escape", capslock: "CapsLock", enter: "Enter", tab: "Tab", backspace: "Backspace", delete: "Delete", pageup: "PageUp", pagedown: "PageDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight", arrowup: "ArrowUp", arrowdown: "ArrowDown" } as Record<string, string>)[keyToken.toLowerCase()] ?? (SHORTCUT_KEY_PATTERN.test(keyToken) ? keyToken : keyToken ? keyToken[0]?.toUpperCase() + keyToken.slice(1).toLowerCase() : "")
  if (keyName && !SHORTCUT_KEY_PATTERN.test(keyName)) return null
  const modifiers = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
  for (const token of tokens) {
    switch (token.toLowerCase()) {
      case 'commandorcontrol':
      case 'cmdorctrl':
        modifiers.ctrlKey = platform !== 'darwin'
        modifiers.metaKey = platform === 'darwin'
        break
      case 'command':
      case 'cmd':
      case 'super':
      case 'meta':
        modifiers.metaKey = true
        break
      case 'control':
      case 'ctrl':
        modifiers.ctrlKey = true
        break
      case 'shift':
        modifiers.shiftKey = true
        break
      case 'alt':
      case 'option':
        modifiers.altKey = true
        break
      default:
        return null
    }
  }
  return { accelerator, keyName, keycode: -1, modifiers }
}

/** Return whether a native event currently has precisely the configured modifier chord. */
function matchesModifiers(
  event: NativeKeyboardEvent,
  modifiers: ParsedHoldShortcut['modifiers'],
): boolean {
  return event.altKey === modifiers.altKey && event.shiftKey === modifiers.shiftKey &&
    event.ctrlKey === modifiers.ctrlKey && event.metaKey === modifiers.metaKey
}

/** Load uiohook-napi only after the user deliberately enables hold-to-talk. */
function loadNativeHook(): NativeHoldLibrary {
  // This function is never reached during application startup or while the setting is disabled.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require('uiohook-napi') as {
    readonly uIOhook: NativeKeyboardHook
    readonly UiohookKey: Readonly<Record<string, number>>
  }
  return { hook: loaded.uIOhook, keys: loaded.UiohookKey }
}

/** Convert an explicitly enabled supported session into a native press-and-hold trigger. */
export class HoldShortcutService {
  private hook: NativeKeyboardHook | null = null
  private bindings: Array<{ shortcut: ParsedHoldShortcut; callbacks: HoldShortcutCallbacks; active: boolean }> = []
  private modifierCodes = new Set<number>()
  private pressed = new Set<number>()
  private nativeLoadFailed = false

  /** Create a lazy native trigger service from the platform-owned dependencies. */
  constructor(private readonly dependencies: HoldShortcutServiceDependencies) {}

  /** Report whether this platform can offer hold-to-talk without loading the native hook. */
  capability(): HoldShortcutCapability {
    const unsupportedReason = this.unsupportedReason()
    if (unsupportedReason) return { supported: false, granted: false, reason: unsupportedReason }
    if (this.nativeLoadFailed || !(this.dependencies.isInstalled ?? (() => true))()) {
      return {
        supported: false,
        granted: false,
        reason:
          'Hold-to-talk is unavailable because its native key-state library is not installed.',
      }
    }
    if (
      this.dependencies.platform === 'darwin' &&
      !(this.dependencies.isAccessibilityGranted?.() ?? false)
    ) {
      return {
        supported: true,
        granted: false,
        reason: 'Grant Accessibility access to enable hold-to-talk.',
      }
    }
    return { supported: true, granted: true, reason: null }
  }

  /**
   * Register a user-enabled press-and-hold accelerator.
   *
   * Args:
   *   accelerator: A configured standard Electron accelerator subset.
   *   callbacks: Recording lifecycle callbacks owned by the main controller.
   *   enabled: Whether the user expressly enabled hold-to-talk.
   * Returns:
   *   The registration result without exposing other keyboard activity.
   */
  register(
    accelerator: string,
    callbacks: HoldShortcutCallbacks,
    enabled: boolean,
  ): ShortcutRegistration {
    return this.registerMany([{ accelerator, callbacks }], enabled)[0] ?? { registered: false, accelerator }
  }

  /** Register configured chords against one native hook, reporting each real outcome. */
  registerMany(bindings: readonly NativeShortcutBinding[], enabled: boolean): ShortcutRegistration[] {
    this.unregister()
    const capability = this.capability()
    if (!enabled || !capability.granted) return bindings.map(({ accelerator }) => ({
      registered: false, accelerator, reason: !enabled ? 'Hold-to-talk is disabled.' : capability.reason ?? 'Native shortcuts are unavailable.',
    }))
    try {
      const native = (this.dependencies.createNative ?? loadNativeHook)()
      this.modifierCodes = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Meta', 'MetaRight', 'Shift', 'ShiftRight'].map((key) => native.keys[key]).filter((key): key is number => typeof key === 'number'))
      const results = bindings.map(({ accelerator, callbacks }): ShortcutRegistration => {
        const shortcut = parseHoldShortcut(accelerator, this.dependencies.platform)
        if (!shortcut) return { registered: false, accelerator, reason: 'This shortcut key is not supported by the native trigger.' }
        const keycode = shortcut.keyName ? native.keys[shortcut.keyName] : -1
        if (typeof keycode !== 'number') return { registered: false, accelerator, reason: 'This shortcut key is not supported by the native trigger.' }
        this.bindings.push({ shortcut: { ...shortcut, keycode }, callbacks, active: false })
        return { registered: true, accelerator }
      })
      if (!this.bindings.length) return results
      this.hook = native.hook
      this.hook.on('keydown', this.handleKeyDown)
      this.hook.on('keyup', this.handleKeyUp)
      this.hook.start()
      return results
    } catch {
      this.nativeLoadFailed = true
      this.unregister()
      return bindings.map(({ accelerator }) => ({ registered: false, accelerator, reason: 'The native shortcut trigger could not be started.' }))
    }
  }

  /** Remove only configured callbacks; never retain or forward arbitrary keyboard input. */
  unregister(): void {
    for (const binding of this.bindings) if (binding.active) binding.callbacks.onStop()
    if (this.hook) {
      this.hook.off('keydown', this.handleKeyDown)
      this.hook.off('keyup', this.handleKeyUp)
      this.hook.stop()
    }
    this.hook = null
    this.bindings = []
    this.pressed.clear()
  }

  /** Activate exact chords once; larger chords take priority over modifier-only prefixes. */
  private readonly handleKeyDown = (event: NativeKeyboardEvent): void => {
    if (this.pressed.has(event.keycode)) return
    this.pressed.add(event.keycode)
    for (const binding of this.bindings) {
      const { shortcut } = binding
      const targetMatches = shortcut.keycode < 0
        ? this.modifierCodes.has(event.keycode) && [...this.pressed].every((code) => this.modifierCodes.has(code))
        : event.keycode === shortcut.keycode && [...this.pressed].every((code) => this.modifierCodes.has(code) || code === shortcut.keycode)
      if (!binding.active && targetMatches && matchesModifiers(event, shortcut.modifiers)) {
        binding.active = true
        binding.callbacks.onStart()
      }
    }
  }

  /** Release active bindings only on a required-key release, not a larger chord's press. */
  private readonly handleKeyUp = (event: NativeKeyboardEvent): void => {
    this.pressed.delete(event.keycode)
    for (const binding of this.bindings) {
      if (!binding.active) continue
      const { shortcut } = binding
      if (event.keycode !== shortcut.keycode && matchesModifiers(event, shortcut.modifiers)) continue
      binding.active = false
      binding.callbacks.onStop()
    }
  }

  /** Return the non-negotiable session/platform availability failure, if any. */
  private unsupportedReason(): string | null {
    if (!['darwin', 'win32', 'linux'].includes(this.dependencies.platform))
      return 'Hold-to-talk is unavailable on this platform.'
    if (this.dependencies.platform === 'linux') {
      if (this.dependencies.environment.XDG_SESSION_TYPE?.toLowerCase() === 'wayland')
        return 'Hold-to-talk is unavailable in Wayland sessions.'
      if (!this.dependencies.environment.DISPLAY) return 'Hold-to-talk requires an X11 session.'
    }
    return null
  }
}
