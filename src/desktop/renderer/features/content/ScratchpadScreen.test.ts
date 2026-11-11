import { describe, expect, it } from 'vitest'

import { addScratchpadTab, scratchpadTabLabel, scratchpadTextSizeClass } from './ScratchpadScreen'

describe('Scratchpad session tabs', () => {
  it('adds a blank selected tab without replacing the existing draft', () => {
    const session = addScratchpadTab(
      [{ id: 'first', title: 'Integration note', content: 'Keep this typing.', summary: null, syncState: 'local' }],
      'second',
    )

    expect(session.selectedId).toBe('second')
    expect(session.tabs).toEqual([
      { id: 'first', title: 'Integration note', content: 'Keep this typing.', summary: null, syncState: 'local' },
      { id: 'second', title: '', content: '', summary: null, syncState: 'local' },
    ])
  })

  it('gives untitled tabs the original title label', () => {
    expect(scratchpadTabLabel({ title: '' })).toBe('Untitled')
  })

  it('maps each local text appearance choice to an editor-size class', () => {
    expect(scratchpadTextSizeClass('small')).toBe('scratchpad-window--text-small')
    expect(scratchpadTextSizeClass('medium')).toBe('scratchpad-window--text-medium')
    expect(scratchpadTextSizeClass('large')).toBe('scratchpad-window--text-large')
  })
})
