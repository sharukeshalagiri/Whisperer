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
