import { randomUUID } from 'node:crypto'

import type { TransformDefinition, TransformReview } from '../../shared/contracts'

/** Opaque platform target intentionally retained only in main-process memory. */
type CaptureTarget = unknown

/** Main-only dependencies needed to capture and conditionally replace text. */
export interface TransformCoordinatorDependencies<TTarget> {
  captureTarget(): Promise<TTarget | null>
  /** Captures only a currently-focused owned review window; arbitrary foreground apps fail closed. */
  captureReviewTarget(): Promise<TTarget | null>
  captureSelection(target: TTarget): Promise<{ text: string } | null>
  /** Selects the target's whole text field, as Cmd/Ctrl+A would; returns whether the keystroke was sent. */
  selectAll?(target: TTarget): Promise<boolean>
  /** Pastes over the still-selected source text; returns a failure reason when nothing was replaced. */
  insertReplacement?(text: string, target: TTarget, sourceText: string): Promise<{ applied: boolean; reason?: string }>
  replaceSelection(text: string, target: TTarget, options: { sourceText: string; reviewTarget: TTarget | null }): Promise<{ applied: boolean; reason?: string }>
  transform(input: { text: string; kind: 'custom'; instruction: string }, options: { signal: AbortSignal }): Promise<{ id: string; text: string }>
  definitions(): TransformDefinition[]
}

interface Session<TTarget> {
  target: TTarget
  sourceText: string
  definition: TransformDefinition
  proposal: string | null
  generation: number
  controller: AbortController | null
  accepting: boolean
}

/** Progress of a one-shot shortcut transform, used to drive the pill and its result pop-up. */
export type TransformRunStatus =
  | { phase: 'applying'; name: string }
  | { phase: 'applied'; name: string; sourceText: string; proposal: string }
  | { phase: 'failed'; name: string; message: string }

/** Coordinates selection capture, cancellable server generation, and conditional native replacement. */
export class TransformCoordinator<TTarget = CaptureTarget> {
  private readonly sessions = new Map<string, Session<TTarget>>()
  private latestSessionId: string | null = null
  private startEpoch = 0
  private running: AbortController | null = null
  private lastRunTarget: TTarget | null = null

  constructor(private readonly dependencies: TransformCoordinatorDependencies<TTarget>) {}

  /** Captures a selection before any focus-changing UI operation. Newer starts win out of order. */
  async start(definitionId?: string): Promise<TransformReview> {
    const definition = this.resolveDefinition(definitionId)
    const epoch = ++this.startEpoch
    const target = await this.dependencies.captureTarget()
    if (epoch !== this.startEpoch) throw new Error('This transform request is no longer active.')
    if (!target) throw new Error('Select text in the app you want to transform, then try again.')
    const captured = await this.dependencies.captureSelection(target)
    if (epoch !== this.startEpoch) throw new Error('This transform request is no longer active.')
    // Preserve the exact captured bytes for equality checks; trim only to reject blank selections.
    if (!captured || !captured.text.trim()) throw new Error('Select text in the app you want to transform, then try again.')
    this.discardAll()
    const sessionId = randomUUID()
    this.sessions.set(sessionId, { target, sourceText: captured.text, definition, proposal: null, generation: 0, controller: null, accepting: false })
    this.latestSessionId = sessionId
    return this.review(sessionId)
  }

  /**
   * Applies a transform straight from its shortcut without opening the hub.
   *
   * Captures the selection, or selects the whole field when nothing is selected, generates a replacement
   * and pastes it over the same selection, like dictation insertion. Status updates drive the pill.
   *
   * Args:
   *   definitionId: Transform to run; defaults to Polish.
   *   report: Receives applying, applied and failed updates.
   * Returns:
   *   The final applied or failed status.
   */
  async run(definitionId: string | undefined, report: (status: TransformRunStatus) => void): Promise<TransformRunStatus> {
    const definition = this.resolveDefinition(definitionId)
    const fail = (message: string): TransformRunStatus => { const status = { phase: 'failed' as const, name: definition.name, message }; report(status); return status }
    const epoch = ++this.startEpoch
    this.discardAll()
    const target = await this.dependencies.captureTarget()
    if (!target) return fail('Click into a text field, then try again.')
    this.lastRunTarget = target
    let captured = await this.dependencies.captureSelection(target)
    if ((!captured || !captured.text.trim()) && this.dependencies.selectAll && await this.dependencies.selectAll(target)) {
      captured = await this.dependencies.captureSelection(target)
    }
    if (epoch !== this.startEpoch) return fail('A newer transform replaced this one.')
    if (!captured || !captured.text.trim()) return fail('There is no text to transform here.')
    report({ phase: 'applying', name: definition.name })
    const controller = new AbortController()
    this.running = controller
    try {
      const result = await this.dependencies.transform({ text: captured.text, kind: 'custom', instruction: definition.prompt }, { signal: controller.signal })
      if (epoch !== this.startEpoch || controller.signal.aborted) return fail('A newer transform replaced this one.')
      if (!result.text.trim()) return fail('The transform returned no text.')
      if (result.text === captured.text) return fail('Your text already looks good.')
      const insert = this.dependencies.insertReplacement
      if (!insert) return fail('Automatic replacement is unavailable on this device.')
      const applied = await insert(result.text, target, captured.text)
      if (!applied.applied) return fail(applied.reason ?? 'The text changed before it could be replaced.')
      const status = { phase: 'applied' as const, name: definition.name, sourceText: captured.text, proposal: result.text }
      report(status)
      return status
    } catch (error) {
      if (controller.signal.aborted) return fail('Transform cancelled.')
      return fail(error instanceof Error && error.message ? error.message : 'The transform could not be completed.')
    } finally {
      if (this.running === controller) this.running = null
    }
  }

  /** The app a shortcut transform last ran in, so focus can return there after a pop-up click. */
  lastTarget(): TTarget | null { return this.lastRunTarget }

  /** Cancels an in-flight shortcut transform, if any. */
  cancelRun(): void { this.running?.abort(); this.running = null; this.startEpoch += 1 }

  /** Returns the latest still-pending review for the View changes action. */
  latest(): TransformReview | null {
    return this.latestSessionId && this.sessions.has(this.latestSessionId) ? this.review(this.latestSessionId) : null
  }

  /** Requests a proposal while keeping the source and eventual replacement main-held. */
  async generate(sessionId: string): Promise<TransformReview> {
    const session = this.session(sessionId)
    if (session.accepting) throw new Error('This transform is already being applied.')
    session.controller?.abort()
    const controller = new AbortController()
    const generation = session.generation + 1
    session.generation = generation
    session.proposal = null
    session.controller = controller
    try {
      const result = await this.dependencies.transform({ text: session.sourceText, kind: 'custom', instruction: session.definition.prompt }, { signal: controller.signal })
      const current = this.sessions.get(sessionId)
      if (!current || current !== session || current.generation !== generation || controller.signal.aborted) throw new Error('This transform request is no longer active.')
      const proposal = result.text.trim()
      if (!proposal) throw new Error('The transform returned no text. Try again.')
      if (proposal === session.sourceText) throw new Error('This transform did not change the selected text.')
      session.proposal = result.text
      return this.review(sessionId)
    } finally {
      const current = this.sessions.get(sessionId)
      if (current && current === session && current.controller === controller) current.controller = null
    }
  }

  /** Replaces only the originally captured selection and only with a generated proposal. */
  async accept(sessionId: string): Promise<void> {
    const session = this.session(sessionId)
    if (session.proposal === null) throw new Error('Generate a preview before applying it.')
    if (session.accepting) throw new Error('This transform is already being applied.')
    // Claim before awaiting native I/O so parallel accepts cannot write twice.
    session.accepting = true
    session.controller?.abort()
    const proposal = session.proposal
    try {
      // Capture the focused hub identity in main; the platform adapter verifies it before restoring the origin.
      const reviewTarget = await this.dependencies.captureReviewTarget()
      const result = await this.dependencies.replaceSelection(proposal, session.target, { sourceText: session.sourceText, reviewTarget })
      if (!result.applied) throw new Error(result.reason || 'The selected text changed, so nothing was replaced.')
    } finally {
      this.discard(sessionId)
    }
  }

  /** Invalidates a review and any late generation completion. */
  reject(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.accepting) return
    this.discard(sessionId)
  }

  private resolveDefinition(definitionId?: string): TransformDefinition {
    const definition = this.dependencies.definitions().find((item) => item.id === (definitionId ?? 'polish'))
    if (!definition) throw new Error('That transform is no longer available.')
    return definition
  }

  private session(sessionId: string): Session<TTarget> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('This transform review is no longer active.')
    return session
  }

  private review(sessionId: string): TransformReview {
    const session = this.session(sessionId)
    return { sessionId, sourceText: session.sourceText, definition: { ...session.definition }, proposal: session.proposal, canApply: !session.accepting }
  }

  private discard(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    session?.controller?.abort()
    this.sessions.delete(sessionId)
    if (this.latestSessionId === sessionId) this.latestSessionId = null
  }

  private discardAll(): void {
    for (const sessionId of this.sessions.keys()) this.discard(sessionId)
  }
}
