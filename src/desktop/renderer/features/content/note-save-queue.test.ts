import { describe, expect, it } from 'vitest'

import { NoteSaveQueue } from './note-save-queue'

describe('NoteSaveQueue', () => {
  it('saves drafts in order and waits for the newest draft before summarizing', async () => {
    const saved: string[] = []
    let releaseFirstSave: (() => void) | undefined
    const firstSave = new Promise<void>((resolve) => {
      releaseFirstSave = resolve
    })
    const queue = new NoteSaveQueue(async (draft) => {
      saved.push(draft.content)
      if (draft.content === 'first') await firstSave
    })

    queue.schedule({ id: 'note-1', title: 'Note', content: 'first' })
    queue.schedule({ id: 'note-1', title: 'Note', content: 'newer' })
    const barrier = queue.flush()

    expect(saved).toEqual(['first'])
    releaseFirstSave?.()
    await barrier

    expect(saved).toEqual(['first', 'newer'])
  })

  it('rejects the save barrier when the newest write fails', async () => {
    const queue = new NoteSaveQueue(async () => {
      throw new Error('Disk unavailable')
    })

    queue.schedule({ id: 'note-1', title: 'Note', content: 'draft' })

    await expect(queue.flush()).rejects.toThrow('Disk unavailable')
  })
})
