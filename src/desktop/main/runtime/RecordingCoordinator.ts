export type RecordingPhase = 'idle' | 'starting' | 'processing';

/** Represents the minimal safe output retained from a transcription response. */
export interface TranscriptionResult {
  text: string;
}

/** Serializes start preparation and submission, rejecting cancelled completions before publication. */
export class RecordingCoordinator {
  private activeController: AbortController | null = null;
  private activePhase: RecordingPhase = 'idle';

  /** Returns the current main-owned asynchronous preparation or submission phase. */
  get phase(): RecordingPhase {
    return this.activePhase;
  }

  /** Invalidates pending work immediately, allowing a fresh generation while late work drains. */
  cancel(): void {
    this.activeController?.abort();
    this.activeController = null;
    this.activePhase = 'idle';
  }

  /** Captures a target under the same cancellation guard, then announces a start only if still current. */
  async prepareStart<T>(captureTarget: () => Promise<T>, ready: (target: T) => void): Promise<void> {
    await this.run('starting', captureTarget, ready);
  }

  /** Submits one transcription request and rejects a stale completion after cancellation. */
  submit(transcribe: (signal: AbortSignal) => Promise<TranscriptionResult>): Promise<TranscriptionResult> {
    return this.run('processing', transcribe);
  }

  /** Reserves before awaiting work and checks the shared abort token before invoking its completion callback. */
  private async run<T>(phase: Exclude<RecordingPhase, 'idle'>, operation: (signal: AbortSignal) => Promise<T>, ready?: (result: T) => void): Promise<T> {
    if (this.activeController !== null) {
      throw new Error(this.activePhase === 'starting' ? 'A recording is already starting' : 'A transcription is already in progress');
    }
    const controller = new AbortController();
    this.activeController = controller;
    this.activePhase = phase;
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted) throw new Error(phase === 'starting' ? 'Recording start cancelled' : 'Transcription cancelled');
      ready?.(result);
      return result;
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
        this.activePhase = 'idle';
      }
    }
  }
}
