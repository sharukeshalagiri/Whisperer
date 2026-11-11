import { describe, expect, it } from 'vitest'

import type { Meeting } from './api'
import {
  applyIncomingMeeting,
  discardMeetingDraft,
  meetingHasDirtyDraft,
  meetingQuestionResponseMatches,
  meetingProcessingLabel,
  moveMeetingDetailTab,
} from './meeting-detail-state'

const revisions = { transcript: 2, summary: 4 }

const meeting: Meeting = {
  id: 'meeting-1',
  title: 'Planning',
  startedAt: '2026-10-17T12:00:00.000Z',
  endedAt: '2026-10-17T12:30:00.000Z',
  durationMs: 1_800_000,
  historyEntryIds: [],
  hasAudio: true,
  transcript: 'Saved transcript',
  transcriptRevision: 2,
  summary: 'Saved summary',
  summaryRevision: 4,
  transcriptStatus: 'complete',
  summaryStatus: 'complete',
  syncState: 'synced',
}

describe('meeting detail state', () => {
  it('moves between the only supported reading tabs with arrow keys', () => {
    expect(moveMeetingDetailTab('transcript', 'ArrowRight')).toBe('summary')
    expect(moveMeetingDetailTab('summary', 'ArrowRight')).toBe('transcript')
    expect(moveMeetingDetailTab('transcript', 'ArrowLeft')).toBe('summary')
    expect(moveMeetingDetailTab('summary', 'Home')).toBe('transcript')
    expect(moveMeetingDetailTab('transcript', 'End')).toBe('summary')
    expect(moveMeetingDetailTab('summary', 'Escape')).toBe('summary')
  })

  it('keeps a dirty transcript and summary while a refresh supplies newer server state', () => {
    const applied = applyIncomingMeeting(
      meeting,
      { ...meeting, transcript: 'Server transcript', summary: 'Server summary', transcriptRevision: 3, summaryRevision: 5 },
      { transcript: 'Unsaved transcript', summary: 'Unsaved summary' },
      { transcript: true, summary: true },
      revisions,
    )

    expect(applied.meeting.transcriptRevision).toBe(3)
    expect(applied.transcript).toBe('Unsaved transcript')
    expect(applied.summary).toBe('Unsaved summary')
    expect(applied.revisions).toEqual(revisions)
    expect(applied.serverChanged).toEqual({ transcript: true, summary: true })
  })

  it('discards a conflicted draft and restores the current server field and revision', () => {
    const discarded = discardMeetingDraft(
      { ...meeting, transcript: 'Newer server transcript', transcriptRevision: 3 },
      { transcript: 'Unsaved transcript', summary: 'Saved summary' },
      revisions,
      'transcript',
    )

    expect(discarded.draft).toEqual({ transcript: 'Newer server transcript', summary: 'Saved summary' })
    expect(discarded.revisions).toEqual({ transcript: 3, summary: 4 })
  })

  it('adopts a refreshed clean field without replacing the other dirty draft', () => {
    const applied = applyIncomingMeeting(
      meeting,
      { ...meeting, transcript: 'Server transcript', summary: 'Server summary' },
      { transcript: 'Unsaved transcript', summary: 'Saved summary' },
      { transcript: true, summary: false },
      revisions,
    )

    expect(applied.transcript).toBe('Unsaved transcript')
    expect(applied.summary).toBe('Server summary')
    expect(applied.revisions).toEqual({ transcript: 2, summary: 4 })
    expect(applied.serverChanged).toEqual({ transcript: false, summary: false })
  })

  it('discards a late refresh for a workspace that has already changed notes', () => {
    const applied = applyIncomingMeeting(
      meeting,
      { ...meeting, id: 'meeting-2', transcript: 'Other transcript', summary: 'Other summary' },
      { transcript: 'Unsaved transcript', summary: 'Unsaved summary' },
      { transcript: true, summary: true },
      revisions,
    )

    expect(applied.meeting).toBe(meeting)
    expect(applied.transcript).toBe('Unsaved transcript')
    expect(applied.summary).toBe('Unsaved summary')
  })

  it('drops a question response after navigating to another note or starting a newer request', () => {
    expect(meetingQuestionResponseMatches({ meetingId: 'meeting-1', requestId: 3 }, { meetingId: 'meeting-1', requestId: 3 })).toBe(true)
    expect(meetingQuestionResponseMatches({ meetingId: 'meeting-1', requestId: 3 }, { meetingId: 'meeting-2', requestId: 3 })).toBe(false)
    expect(meetingQuestionResponseMatches({ meetingId: 'meeting-1', requestId: 3 }, { meetingId: 'meeting-1', requestId: 4 })).toBe(false)
  })

  it('requires explicit confirmation before discarding any unsaved workspace field', () => {
    expect(meetingHasDirtyDraft({ transcript: false, summary: false })).toBe(false)
    expect(meetingHasDirtyDraft({ transcript: true, summary: false })).toBe(true)
    expect(meetingHasDirtyDraft({ transcript: false, summary: true })).toBe(true)
  })

  it.each([
    [{ ...meeting, syncState: 'pending' }, 'Waiting to sync'],
    [{ ...meeting, transcriptStatus: 'running' }, 'Preparing transcript…'],
    [{ ...meeting, summaryStatus: 'pending' }, 'Preparing summary…'],
    [{ ...meeting, summaryStale: true }, 'Summary is out of date'],
    [{ ...meeting, summaryStatus: 'failed', error: 'Gateway unavailable' }, 'Summary failed — retry when ready'],
    [meeting, 'Ready'],
  ] satisfies Array<[Meeting, string]>)('describes %s with a finite recovery state', (item, label) => {
    expect(meetingProcessingLabel(item)).toBe(label)
  })
})
