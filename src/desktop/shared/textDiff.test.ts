import { describe, expect, it } from 'vitest'

import { diffWords } from './textDiff'

/** Rebuilds one side of the comparison from its segments. */
function side(segments: ReturnType<typeof diffWords>, kind: 'removed' | 'added'): string {
  return segments.filter((segment) => segment.kind === 'same' || segment.kind === kind).map((segment) => segment.text).join('')
}

describe('diffWords', () => {
  it('marks replaced words and keeps both sides reconstructible', () => {
    const before = 'Transform probe sentence that needs polishing.'
    const after = 'Transform the probe sentence that needs polishing.'
    const segments = diffWords(before, after)
    expect(side(segments, 'removed')).toBe(before)
    expect(side(segments, 'added')).toBe(after)
    expect(segments.filter((segment) => segment.kind === 'added').map((segment) => segment.text.trim())).toEqual(['the'])
    expect(segments.some((segment) => segment.kind === 'removed')).toBe(false)
  })

  it('reports a full rewrite as removed then added text', () => {
    expect(diffWords('alpha', 'beta')).toEqual([{ kind: 'removed', text: 'alpha' }, { kind: 'added', text: 'beta' }])
  })

  it('handles empty inputs', () => {
    expect(diffWords('', '')).toEqual([])
    expect(diffWords('', 'new')).toEqual([{ kind: 'added', text: 'new' }])
  })
})
