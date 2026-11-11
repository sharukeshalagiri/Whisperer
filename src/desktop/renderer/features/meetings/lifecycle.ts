/** Invalidates late microphone and MediaRecorder work after a terminal action. */
export class CaptureGenerationController {
  private value = 0;

  /** Starts a new capture and returns the generation it owns. */
  begin(): number {
    this.value += 1;
    return this.value;
  }

  /** Invalidates the active capture and returns the new generation. */
  cancel(): number {
    this.value += 1;
    return this.value;
  }

  /** Returns whether a generation still owns asynchronous capture work. */
  isCurrent(generation: number): boolean {
    return generation === this.value;
  }
}

/** Runs MediaRecorder chunk persistence in arrival order. */
export class SerializedChunkQueue {
  private pending: Promise<void> = Promise.resolve();
  private failure: unknown = null;

  /** Adds one chunk operation after all prior chunk operations. */
  append(operation: () => Promise<void>): void {
    this.pending = this.pending.then(operation).catch((error: unknown) => {
      this.failure ??= error;
    });
  }

  /** Waits for every queued chunk operation and reports the first failure. */
  async drain(): Promise<void> {
    await this.pending;
    if (this.failure !== null) throw this.failure;
  }
}
