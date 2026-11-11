import { describe, expect, it } from 'vitest'

import { RecordingCoordinator } from './RecordingCoordinator'

describe('RecordingCoordinator cancellation', () => {
  it('aborts the in-flight transcription request and rejects its late result', async () => {
    const coordinator = new RecordingCoordinator()
    let received: AbortSignal | undefined
    let finish: (value: { text: string }) => void = () => undefined
    const pending = coordinator.submit((signal) => { received = signal; return new Promise((resolve) => { finish = resolve }) })

    coordinator.cancel()
    finish({ text: 'late transcript' })

    expect(received?.aborted).toBe(true)
    await expect(pending).rejects.toThrow('Transcription cancelled')
    expect(coordinator.phase).toBe('idle')
  })
})
