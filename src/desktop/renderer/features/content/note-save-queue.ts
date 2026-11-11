export interface NoteDraft {
  id?: string
  title: string
  content: string
}

type SaveDraft = (draft: NoteDraft) => Promise<void>

/** Serializes note writes while collapsing superseded drafts into the newest state. */
export class NoteSaveQueue {
  private latestDraft: NoteDraft | undefined
  private isSaving = false
  private completion: Promise<void> = Promise.resolve()

  /**
   * @param saveDraft Persists one immutable draft to the local store.
   */
  constructor(private readonly saveDraft: SaveDraft) {}

  /**
   * Replaces any pending draft and starts persistence when the queue is idle.
   *
   * @param draft The latest title and content from the editor.
   * @returns Nothing; use flush to await durable persistence.
   */
  schedule(draft: NoteDraft): void {
    this.latestDraft = draft
    if (!this.isSaving) this.start()
  }

  /**
   * Waits until every draft scheduled before the call is saved.
   *
   * @returns A rejected promise when the newest write fails.
   */
  flush(): Promise<void> {
    return this.completion
  }

  /** Starts one background save chain for all current and subsequent pending drafts. */
  private start(): void {
    this.isSaving = true
    this.completion = this.drain()
  }

  /** Saves the newest available draft until no newer draft remains. */
  private async drain(): Promise<void> {
    try {
      while (this.latestDraft) {
        const draft = this.latestDraft
        this.latestDraft = undefined
        await this.saveDraft(draft)
      }
    } finally {
      this.isSaving = false
      if (this.latestDraft) this.start()
    }
  }
}
