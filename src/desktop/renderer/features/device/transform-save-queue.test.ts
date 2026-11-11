import { describe, expect, it } from 'vitest'

import { TransformSaveQueue } from './transform-save-queue'

interface Draft { key: string; id?: string; name: string; prompt: string; shortcut: string }

describe('TransformSaveQueue', () => {
  it('preserves an edit made while a create request is in flight and reuses its id', async () => {
    let resolveFirst: ((value: Draft) => void) | undefined
    const writes: Draft[] = []
    const queue = new TransformSaveQueue<Draft>(async (draft) => {
      writes.push({ ...draft })
      if (writes.length === 1) return new Promise<Draft>((resolve) => { resolveFirst = resolve })
      return { ...draft, id: 'custom-1' }
    })
    queue.replace({ key: 'draft', name: 'First', prompt: 'Prompt', shortcut: 'Alt+1' })
    const first = queue.flush()
    queue.replace({ key: 'draft', name: 'Edited while saving', prompt: 'Prompt', shortcut: 'Alt+1' })
    resolveFirst?.({ key: 'draft', id: 'custom-1', name: 'First', prompt: 'Prompt', shortcut: 'Alt+1' })
    await first

    expect(writes).toEqual([
      { key: 'draft', name: 'First', prompt: 'Prompt', shortcut: 'Alt+1' },
      { key: 'draft', id: 'custom-1', name: 'Edited while saving', prompt: 'Prompt', shortcut: 'Alt+1' },
    ])
    expect(queue.current()).toEqual({ key: 'draft', id: 'custom-1', name: 'Edited while saving', prompt: 'Prompt', shortcut: 'Alt+1' })
  })

  it('flushes a new transform once on close rather than creating duplicates', async () => {
    const writes: Draft[] = []
    let resolveWrite: ((value: Draft) => void) | undefined
    const queue = new TransformSaveQueue<Draft>(async (draft) => {
      writes.push({ ...draft })
      return new Promise<Draft>((resolve) => { resolveWrite = resolve })
    })
    queue.replace({ key: 'draft', name: 'New', prompt: 'Prompt', shortcut: 'Alt+1' })
    const close = queue.flush()
    const unmount = queue.flush()
    resolveWrite?.({ key: 'draft', id: 'custom-1', name: 'New', prompt: 'Prompt', shortcut: 'Alt+1' })
    await Promise.all([close, unmount])

    expect(writes).toHaveLength(1)
    expect(writes[0]?.id).toBeUndefined()
  })
})
