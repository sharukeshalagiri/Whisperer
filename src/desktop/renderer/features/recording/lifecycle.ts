/** The externally visible stages of one recorder capture. */
export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'stopping' | 'processing' | 'error';

/**
 * Tracks the one live capture and invalidates stale asynchronous work.
 *
 * A generation is deliberately lightweight: microphone acquisition, worklet
 * flushing, and IPC submission all check it before they make an observable
 * change. Starting or cancelling a capture invalidates every earlier token.
 */
export class CaptureGenerationController {
  private value = 0;

  /** Starts a new capture and returns its cancellation token. */
  begin(): number {
    this.value += 1;
    return this.value;
  }

  /** Invalidates the live capture and returns the next token value. */
  cancel(): number {
    this.value += 1;
    return this.value;
  }

  /** Returns whether asynchronous work still belongs to the live capture. */
  isCurrent(generation: number): boolean {
    return generation === this.value;
  }
}

/** Returns whether a phase owns microphone resources. */
export function isCapturing(phase: RecordingPhase): boolean {
  return phase === 'starting' || phase === 'recording' || phase === 'stopping';
}

/** How one take ended in the hub. */
export type TakeOutcome = 'submitted' | 'submitFailed' | 'failed' | 'empty';

/**
 * The capture phase the hub reports to main when a take ends, or null when main already knows.
 *
 * Main records a successful `recording.submit` itself, so repeating it is redundant. Failures are
 * always reported: some (a rejected request) never reach main's own bookkeeping, and every report
 * carries its take, so a late one cannot end a newer take.
 *
 * Args:
 *   outcome: How the take ended.
 * Returns:
 *   `failed` or `idle` to report, or null after a successful submit.
 */
export function endOfTakeReport(outcome: TakeOutcome): 'failed' | 'idle' | null {
  if (outcome === 'failed' || outcome === 'submitFailed') return 'failed';
  if (outcome === 'empty') return 'idle';
  return null;
}

/**
 * What the pill's Retry does: resubmit the take whose transcription failed, or record a new one.
 *
 * Args:
 *   phase: Current recorder phase.
 *   hasFailedTake: Whether the audio of a failed transcription is still held in memory.
 * Returns:
 *   `resubmit` after a failed transcription, otherwise `record`.
 */
export function retryAction(phase: RecordingPhase, hasFailedTake: boolean): 'resubmit' | 'record' {
  return phase === 'error' && hasFailedTake ? 'resubmit' : 'record'
}
