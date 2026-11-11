import { describe, expect, it } from 'vitest'

import type { Note } from '../../../shared/contracts'

import { displayNoteTitle, notePreview, sortRecentNotes } from './NotesScreen'
import { syncStateLabel } from './sync-state'

describe('Scratchpad landing note presentation', () => {
  const notes: Note[] = [
    {
      id: 'older',
      title: 'Earlier thought',
      content: 'A short note.',
      summary: null,
      updatedAt: '2026-10-11T09:00:00.000Z',
      pinned: false,
      localOnly: false,
      syncState: 'synced',
    },
    {
      id: 'pinned',
      title: 'Pinned thought',
      content: 'Keep this front and center.',
      summary: null,
      updatedAt: '2026-10-10T09:00:00.000Z',
      pinned: true,
      localOnly: false,
      syncState: 'local',
    },
    {
      id: 'newer',
      title: '',
      content: 'The newest unpinned note.',
      summary: null,
      updatedAt: '2026-10-12T09:00:00.000Z',
      pinned: false,
      localOnly: false,
      syncState: 'pending',
    },
  ]

  it('puts pinned notes first and otherwise orders recents by update time', () => {
    expect(sortRecentNotes(notes).map((note) => note.id)).toEqual(['pinned', 'newer', 'older'])
  })

  it('uses the original empty-note label and a compact text preview', () => {
    expect(displayNoteTitle(notes[2]!)).toEqual('Untitled note')
    expect(notePreview('First line\n\nsecond line')).toEqual('First line second line')
  })
})

describe('syncStateLabel', () => {
  it('uses clear server-sync labels for all renderer-visible note states', () => {
    expect(syncStateLabel('pending')).toEqual('Sync pending')
    expect(syncStateLabel('error')).toEqual('Sync error')
    expect(syncStateLabel('local')).toEqual('Local only')
    expect(syncStateLabel('synced')).toEqual('Synced')
  })
})
