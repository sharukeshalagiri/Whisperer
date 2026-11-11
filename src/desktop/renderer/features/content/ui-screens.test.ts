import { describe, expect, it } from 'vitest'

import {
  filterDictionaryEntries,
  filterMeetings,
  filterSnippets,
  formatHistoryTime,
  groupHistoryByDate,
  meetingDayLabel,
  matchesHistoryEntry,
} from './ui-screen-utils'
import { formatDate } from './format'

const dictionary = [
  { id: '1', phrase: 'whisper er', replacement: 'Whisperer' },
  { id: '2', phrase: 'Katherine', replacement: '' },
]
const snippets = [
  { id: '1', shortcut: 'intro email', text: 'Hello, great to meet you.', useCount: 0 },
  { id: '2', shortcut: 'linkedin', text: 'https://www.linkedin.com/in/example', useCount: 0 },
]
const meeting = {
  id: 'meeting-1',
  title: 'Product review',
  startedAt: '2026-10-12T09:00:00.000Z',
  endedAt: null,
  durationMs: 0,
  historyEntryIds: [],
  hasAudio: false,
}
const history = {
  id: 'history-1',
  text: 'A polished transcript',
  rawText: 'a raw transcript',
  createdAt: '2026-10-12T09:00:00.000Z',
  durationMs: 5000,
  language: 'en',
  appName: 'Mail',
  pasted: true,
  status: 'completed' as const,
}

describe('content screen filtering', () => {
  it('finds dictionary words in either the recognized or replacement text', () => {
    expect(filterDictionaryEntries(dictionary, 'whisperer')).toEqual([dictionary[0]])
    expect(filterDictionaryEntries(dictionary, 'katherine')).toEqual([dictionary[1]])
  })

  it('finds snippets by their trigger and persisted expansion', () => {
    expect(filterSnippets(snippets, 'intro')).toEqual([snippets[0]])
    expect(filterSnippets(snippets, 'linkedin.com')).toEqual([snippets[1]])
  })

  it('finds local meetings by persisted title', () => {
    expect(filterMeetings([meeting], 'product')).toEqual([meeting])
    expect(filterMeetings([meeting], 'other')).toEqual([])
  })

  it('searches both raw and final local dictation and retains date headings', () => {
    expect(matchesHistoryEntry(history, 'polished')).toBe(true)
    expect(matchesHistoryEntry(history, 'raw')).toBe(true)
    expect(groupHistoryByDate([history])).toHaveLength(1)
  })

  it('groups dictations by local day and names today and yesterday', () => {
    const now = new Date(2026, 9, 14, 0, 30)
    const at = (id: string, date: Date) => ({ ...history, id, createdAt: date.toISOString() })
    const late = at('late', new Date(2026, 9, 13, 23, 59))
    const groups = groupHistoryByDate([at('today', new Date(2026, 9, 14, 0, 5)), late, at('evening', new Date(2026, 9, 13, 16, 50)), at('old', new Date(2026, 9, 11, 9, 0))], now)
    expect(groups.map(([label, entries]) => [label, entries.map(({ id }) => id)])).toEqual([
      ['Today', ['today']],
      ['Yesterday', ['late', 'evening']],
      [formatDate(new Date(2026, 9, 11, 9, 0).toISOString()), ['old']],
    ])
    expect(groupHistoryByDate([{ ...history, createdAt: 'invalid' }], now)[0]?.[0]).toBe('No date available')
  })

  it('labels meeting calendar days without assuming a 24-hour local day', () => {
    const now = new Date(2026, 2, 9, 12)
    expect(meetingDayLabel(new Date(2026, 2, 9, 8).toISOString(), now)).toBe('Today')
    expect(meetingDayLabel(new Date(2026, 2, 8, 8).toISOString(), now)).toBe('Yesterday')
    expect(meetingDayLabel('invalid', now)).toBe('No date available')
  })

  it('shows history times as a compact 12 hour clock', () => {
    expect(formatHistoryTime(new Date(2026, 9, 13, 16, 50).toISOString())).toBe('4:50pm')
    expect(formatHistoryTime(new Date(2026, 9, 13, 0, 5).toISOString())).toBe('12:05am')
    expect(formatHistoryTime(new Date(2026, 9, 13, 12, 0).toISOString())).toBe('12:00pm')
    expect(formatHistoryTime('invalid')).toBe('')
  })
})
