/** Minimal identity required to serialize a transform editor draft. */
export interface QueuedTransformDraft {
  key: string
  id?: string
}

/** Serializes transform autosaves while preserving edits made during an in-flight request. */
export class TransformSaveQueue<T extends QueuedTransformDraft> {
  private draft: T | null = null
  private revision = 0
  private savedRevision = 0
  private runner: Promise<void> | null = null

  /** Creates a queue over the narrow persistence callback supplied by the screen. */
  constructor(private readonly persist: (draft: T) => Promise<T>) {}

  /** Loads an editor snapshot without marking it dirty. */
  hydrate(draft: T): void {
    this.draft = { ...draft }
    this.revision = 0
    this.savedRevision = 0
  }

  /** Replaces the pending editor snapshot without starting network work. */
  replace(draft: T): void {
    this.draft = { ...draft }
    this.revision += 1
  }

  /** Returns the latest snapshot, including an id assigned by a completed create. */
  current(): T | null {
    return this.draft ? { ...this.draft } : null
  }

  /** Drains every revision known when work settles, serializing writes and preserving a stable create id. */
  async flush(): Promise<void> {
    if (!this.draft || this.savedRevision >= this.revision) return
    if (!this.runner) this.runner = this.drain()
    await this.runner
    if (this.savedRevision < this.revision) await this.flush()
  }

  private async drain(): Promise<void> {
    try {
      while (this.draft && this.savedRevision < this.revision) {
        const revision = this.revision
        const submitted = { ...this.draft }
        const saved = await this.persist(submitted)
        if (this.draft?.key === submitted.key) {
          // Never replace current fields: they might have been edited while this request waited.
          this.draft = { ...this.draft, id: saved.id }
        }
        this.savedRevision = revision
      }
    } finally {
      this.runner = null
    }
  }
}
