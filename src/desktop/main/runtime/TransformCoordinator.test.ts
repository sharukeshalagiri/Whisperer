import { describe, expect, it } from 'vitest'

import type { TransformDefinition } from '../../shared/contracts'
import { TransformCoordinator, type TransformRunStatus } from './TransformCoordinator'

const definition: TransformDefinition = {
  id: 'polish', name: 'Polish', prompt: 'Make this clear.', shortcut: 'Alt+1', builtIn: true,
}

describe('TransformCoordinator', () => {
  it('holds capture and proposal in main until explicit conditional acceptance', async () => {
    const calls: string[] = []
    const coordinator = new TransformCoordinator({
      captureTarget: async () => ({ target: true }),
      captureReviewTarget: async () => ({ target: true }),
      captureSelection: async () => ({ text: 'source' }),
      replaceSelection: async (text, _target, options) => { calls.push(`${text}:${options.sourceText}`); return { applied: true } },
      transform: async () => ({ id: 'server', text: 'proposal' }),
      definitions: () => [definition],
    })

    const review = await coordinator.start('polish')
    expect(review).toMatchObject({ sourceText: 'source', proposal: null, definition })
    const generated = await coordinator.generate(review.sessionId)
    expect(generated.proposal).toBe('proposal')
    await coordinator.accept(review.sessionId)
    expect(calls).toEqual(['proposal:source'])
  })

  it('preserves captured whitespace for conditional replacement', async () => {
    const sources: string[] = []
    const coordinator = new TransformCoordinator({
      captureTarget: async () => ({ target: true }),
      captureReviewTarget: async () => ({ target: true }),
      captureSelection: async () => ({ text: ' source\n' }),
      replaceSelection: async (_text, _target, options) => { sources.push(options.sourceText); return { applied: true } },
      transform: async () => ({ id: 'server', text: 'proposal' }),
      definitions: () => [definition],
    })
    const review = await coordinator.start('polish')
    await coordinator.generate(review.sessionId)
    await coordinator.accept(review.sessionId)
    expect(sources).toEqual([' source\n'])
  })

  it('rejects empty captures and never allows arbitrary replacement text', async () => {
    const coordinator = new TransformCoordinator({
      captureTarget: async () => null,
      captureReviewTarget: async () => null,
      captureSelection: async () => null,
      replaceSelection: async () => ({ applied: false }),
      transform: async () => ({ id: 'server', text: 'proposal' }),
      definitions: () => [definition],
    })
    await expect(coordinator.start('polish')).rejects.toThrow('Select text')
  })

  it('claims a proposal before native replacement so concurrent accepts cannot paste twice', async () => {
    let release: (() => void) | undefined
    let writes = 0
    const coordinator = new TransformCoordinator({
      captureTarget: async () => ({ target: true }),
      captureReviewTarget: async () => ({ target: true }),
      captureSelection: async () => ({ text: 'source' }),
      replaceSelection: async () => { writes += 1; await new Promise<void>((resolve) => { release = resolve }); return { applied: true } },
      transform: async () => ({ id: 'server', text: 'proposal' }),
      definitions: () => [definition],
    })
    const review = await coordinator.start('polish')
    await coordinator.generate(review.sessionId)
    const first = coordinator.accept(review.sessionId)
    await expect(coordinator.accept(review.sessionId)).rejects.toThrow('already being applied')
    await Promise.resolve()
    release?.()
    await first
    expect(writes).toBe(1)
  })

  it('fails closed when native selection changed before acceptance', async () => {
    const coordinator = new TransformCoordinator({
      captureTarget: async () => ({ target: true }),
      captureReviewTarget: async () => ({ target: true }),
      captureSelection: async () => ({ text: 'source' }),
      replaceSelection: async () => ({ applied: false, reason: 'The selection changed.' }),
      transform: async () => ({ id: 'server', text: 'proposal' }),
      definitions: () => [definition],
    })
    const review = await coordinator.start('polish')
    await coordinator.generate(review.sessionId)
    await expect(coordinator.accept(review.sessionId)).rejects.toThrow('selection changed')
  })

  it('applies a shortcut transform in place, selecting all when nothing is selected', async () => {
    const events: string[] = []
    let selected = ''
    const statuses: TransformRunStatus[] = []
    const coordinator = new TransformCoordinator({
      captureTarget: async () => ({ target: true }),
      captureReviewTarget: async () => null,
      captureSelection: async () => ({ text: selected }),
      selectAll: async () => { events.push('selectAll'); selected = 'whole field'; return true },
      insertReplacement: async (text, _target, sourceText) => { events.push(`insert:${text}:${sourceText}`); return { applied: true } },
      replaceSelection: async () => ({ applied: false }),
      transform: async (input) => { events.push(`transform:${input.text}`); return { id: 'server', text: 'Whole field.' } },
      definitions: () => [definition],
    })

    const result = await coordinator.run('polish', (status) => statuses.push(status))

    expect(events).toEqual(['selectAll', 'transform:whole field', 'insert:Whole field.:whole field'])
    expect(statuses.map((status) => status.phase)).toEqual(['applying', 'applied'])
    expect(result).toEqual({ phase: 'applied', name: 'Polish', sourceText: 'whole field', proposal: 'Whole field.' })
  })

  it('reports a failed shortcut transform without pasting', async () => {
    let inserted = false
    const coordinator = new TransformCoordinator({
      captureTarget: async () => ({ target: true }),
      captureReviewTarget: async () => null,
      captureSelection: async () => ({ text: 'text' }),
      insertReplacement: async () => { inserted = true; return { applied: true } },
      replaceSelection: async () => ({ applied: false }),
      transform: async () => ({ id: 'server', text: 'text' }),
      definitions: () => [definition],
    })

    await expect(coordinator.run('polish', () => undefined)).resolves.toEqual({ phase: 'failed', name: 'Polish', message: 'Your text already looks good.' })
    expect(inserted).toBe(false)
  })

  it('fails clearly when there is no text field to transform', async () => {
    const coordinator = new TransformCoordinator({
      captureTarget: async () => ({ target: true }),
      captureReviewTarget: async () => null,
      captureSelection: async () => null,
      selectAll: async () => false,
      replaceSelection: async () => ({ applied: false }),
      transform: async () => { throw new Error('not reached') },
      definitions: () => [definition],
    })

    await expect(coordinator.run('polish', () => undefined)).resolves.toMatchObject({ phase: 'failed', message: 'There is no text to transform here.' })
  })
})
