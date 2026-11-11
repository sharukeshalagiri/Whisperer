import type { ShortcutAction } from '../../shared/shortcuts'

/** Recording style selected by the shortcut that started dictation. */
export type ShortcutRecordingMode = 'push-to-talk' | 'handsfree'

/** Main-process operations the dispatcher may invoke; all Electron work stays in the caller. */
export interface ShortcutDispatchDependencies {
  /** Starts dictation in the requested mode. */
  readonly start: (mode: ShortcutRecordingMode) => Promise<void>
  /** Stops dictation and submits the captured audio. */
  readonly stop: () => Promise<void>
  /** Discards active dictation without submitting it. */
  readonly cancel: () => Promise<void>
  /** Runs a one-shot action such as paste, copy, scratchpad or a renderer review route. */
  readonly action: (action: Exclude<ShortcutAction, 'holdToTalk' | 'toggleRecording' | 'cancel'>) => Promise<void>
  /** Reports whether dictation is still active, so external stops reset shortcut state. */
  readonly active?: () => boolean
  /** Reports a push-to-talk recording that was upgraded to hands-free. */
  readonly setMode?: (mode: ShortcutRecordingMode) => void
  /** Returns monotonic milliseconds; tests inject a clock. */
  readonly now?: () => number
  /** Presents the hold hint after a too-short press. */
  readonly shortTap?: () => void
  /** Allows the third-tap Notetaker transition only after setup. */
  readonly canStartMeeting?: () => boolean
  /** Allows cancel during upload as well as local capture. */
  readonly cancelAvailable?: () => boolean
}

/** Actions the onboarding try-it step may use before setup completes. */
const ONBOARDING_ACTIONS: ReadonlySet<ShortcutAction> = new Set(['holdToTalk', 'toggleRecording', 'cancel'])

/**
 * Decides whether a native shortcut may run in the current session state.
 *
 * Args:
 *   action: The bound action.
 *   state: Whether the user is signed in, has finished onboarding, and whether a recorder or key test is open.
 * Returns:
 *   True only when the action is allowed now.
 */
export function shortcutActionAllowed(action: ShortcutAction, state: { signedIn: boolean; onboardingCompleted: boolean; capturing: boolean }): boolean {
  if (!state.signedIn || state.capturing) return false
  return state.onboardingCompleted || ONBOARDING_ACTIONS.has(action)
}

/** A press shorter than this cancels; a second press within it locks hands-free. */
export const TAP_WINDOW_MS = 500

/** Converts native key-down and key-up events into dictation lifecycle and one-shot actions. */
export class ShortcutActionDispatcher {
  private mode: ShortcutRecordingMode | null = null
  private pressedAt = 0
  private lastTapAt = Number.NEGATIVE_INFINITY
  private lockedAt = Number.NEGATIVE_INFINITY

  /** Creates a dispatcher over injected main-process operations. */
  constructor(private readonly dependencies: ShortcutDispatchDependencies) {}

  /**
   * Handles a configured chord becoming fully pressed.
   *
   * Args:
   *   action: The action bound to the pressed chord.
   */
  async down(action: ShortcutAction, occurredAt = this.now()): Promise<void> {
    this.syncActive()
    const now = occurredAt
    if (action === 'holdToTalk') {
      if (this.mode === 'handsfree') {
        if (now - this.lockedAt <= TAP_WINDOW_MS && this.dependencies.canStartMeeting?.()) {
          this.mode = null
          await this.dependencies.cancel()
          return this.dependencies.action('startMeeting')
        }
        return this.finish()
      }
      if (this.mode) return
      if (now - this.lastTapAt <= TAP_WINDOW_MS) {
        this.lockedAt = now
        return this.begin('handsfree')
      }
      this.pressedAt = now
      return this.begin('push-to-talk')
    }
    if (action === 'toggleRecording') {
      if (this.mode === 'push-to-talk') {
        this.mode = 'handsfree'
        this.dependencies.setMode?.('handsfree')
        return
      }
      return this.mode ? this.finish() : this.begin('handsfree')
    }
    if (action === 'cancel') {
      if (!this.mode && !this.dependencies.cancelAvailable?.()) return
      this.mode = null
      return this.dependencies.cancel()
    }
    return this.dependencies.action(action)
  }

  /**
   * Handles a configured chord being released.
   *
   * Args:
   *   action: The action bound to the released chord.
   */
  async up(action: ShortcutAction, occurredAt = this.now()): Promise<void> {
    this.syncActive()
    if (action !== 'holdToTalk' || this.mode !== 'push-to-talk') return
    const now = occurredAt
    this.mode = null
    if (now - this.pressedAt < TAP_WINDOW_MS) {
      this.lastTapAt = now
      await this.dependencies.cancel()
      this.dependencies.shortTap?.()
      return
    }
    return this.dependencies.stop()
  }

  /** Forgets shortcut state after suspension or sign-out. */
  reset(): void {
    this.mode = null
    this.lastTapAt = Number.NEGATIVE_INFINITY
  }

  private async begin(mode: ShortcutRecordingMode): Promise<void> {
    this.mode = mode
    this.lastTapAt = Number.NEGATIVE_INFINITY
    try {
      await this.dependencies.start(mode)
    } catch (error) {
      this.mode = null
      throw error
    }
  }

  private async finish(): Promise<void> {
    this.mode = null
    await this.dependencies.stop()
  }

  private syncActive(): void {
    if (!this.dependencies.active) return
    if (this.mode && !this.dependencies.active()) this.mode = null
    else if (!this.mode && this.dependencies.active()) this.mode = 'handsfree'
  }

  private now(): number {
    return (this.dependencies.now ?? Date.now)()
  }
}
