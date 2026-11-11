import type { Meeting } from './api'

/** The two authoritative meeting text surfaces that the backend persists. */
export type MeetingDetailTab = 'transcript' | 'summary'

/** A local editable copy of the backend-owned text fields. */
export interface MeetingDraft {
  /** Current transcript text, including unsaved edits. */
  transcript: string
  /** Current summary text, including unsaved edits. */
  summary: string
}

/** Tracks which local copies must survive a background refresh. */
export type MeetingDirtyFields = Record<MeetingDetailTab, boolean>

/** Holds the server revision on which each local draft began. */
export type MeetingDraftRevisions = Record<MeetingDetailTab, number | undefined>

/** Combines a refreshed record with retained local drafts. */
export interface AppliedIncomingMeeting extends MeetingDraft {
  /** The newest server record and its revisions. */
  meeting: Meeting
  /** Base revisions to use for later conditional saves. */
  revisions: MeetingDraftRevisions
  /** Whether a dirty draft now conflicts with a changed server revision. */
  serverChanged: Record<MeetingDetailTab, boolean>
}

/** Represents a discarded draft restored from the most recent server record. */
export interface DiscardedMeetingDraft {
  /** The rebuilt local text values. */
  draft: MeetingDraft
  /** The refreshed server revisions safe for a new edit. */
  revisions: MeetingDraftRevisions
}

const meetingTabs: readonly MeetingDetailTab[] = ['transcript', 'summary']

/** Identifies one ephemeral question request while one meeting workspace is open. */
export interface MeetingQuestionRequestIdentity { meetingId: string; requestId: number }

/** Returns true only when navigation or a newer request did not supersede a response. */
export function meetingQuestionResponseMatches(response: MeetingQuestionRequestIdentity, current: MeetingQuestionRequestIdentity): boolean {
  return response.meetingId === current.meetingId && response.requestId === current.requestId
}

/**
 * Finds the reading tab requested by familiar tab-list keyboard commands.
 *
 * Args:
 *   tab: The tab that currently owns focus.
 *   key: The key reported by the tab button.
 * Returns:
 *   The next supported tab, or the current tab when the key is unrelated.
 */
export function moveMeetingDetailTab(tab: MeetingDetailTab, key: string): MeetingDetailTab {
  const index = meetingTabs.indexOf(tab)
  if (key === 'Home') return meetingTabs[0]!
  if (key === 'End') return meetingTabs[meetingTabs.length - 1]!
  if (key === 'ArrowRight' || key === 'ArrowDown') return meetingTabs[(index + 1) % meetingTabs.length]!
  if (key === 'ArrowLeft' || key === 'ArrowUp') return meetingTabs[(index - 1 + meetingTabs.length) % meetingTabs.length]!
  return tab
}

/**
 * Applies a background meeting refresh without overwriting a user draft.
 *
 * Args:
 *   current: The record whose revisions underpin the open workspace.
 *   incoming: The newly fetched authoritative record.
 *   draft: The text currently displayed in the editor.
 *   dirty: Whether each displayed text value has unsaved local changes.
 *   revisions: The server revisions at which the displayed drafts began.
 * Returns:
 *   The new record, safe draft values, original conditional-save revisions, and
 *   a field-level concurrent-change indication.
 */
export function applyIncomingMeeting(
  current: Meeting,
  incoming: Meeting,
  draft: MeetingDraft,
  dirty: MeetingDirtyFields,
  revisions: MeetingDraftRevisions,
): AppliedIncomingMeeting {
  if (incoming.id !== current.id) return {
    meeting: current,
    ...draft,
    revisions,
    serverChanged: { transcript: false, summary: false },
  }
  const incomingRevisions: MeetingDraftRevisions = {
    transcript: incoming.transcriptRevision,
    summary: incoming.summaryRevision,
  }
  return {
    meeting: incoming,
    transcript: dirty.transcript ? draft.transcript : incoming.transcript ?? '',
    summary: dirty.summary ? draft.summary : incoming.summary ?? '',
    revisions: {
      transcript: dirty.transcript ? revisions.transcript : incomingRevisions.transcript,
      summary: dirty.summary ? revisions.summary : incomingRevisions.summary,
    },
    serverChanged: {
      transcript: dirty.transcript && revisions.transcript !== undefined && revisions.transcript !== incomingRevisions.transcript,
      summary: dirty.summary && revisions.summary !== undefined && revisions.summary !== incomingRevisions.summary,
    },
  }
}

/**
 * Discards one local text draft in favour of its latest fetched server value.
 *
 * Args:
 *   meeting: The newest authoritative meeting record already held in the workspace.
 *   draft: The currently displayed local text values.
 *   revisions: The conditional-save revisions associated with those local values.
 *   field: The field whose draft the person chose to discard.
 * Returns:
 *   Restored text and revisions, leaving the other field untouched.
 */
export function discardMeetingDraft(
  meeting: Meeting,
  draft: MeetingDraft,
  revisions: MeetingDraftRevisions,
  field: MeetingDetailTab,
): DiscardedMeetingDraft {
  return field === 'transcript'
    ? { draft: { ...draft, transcript: meeting.transcript ?? '' }, revisions: { ...revisions, transcript: meeting.transcriptRevision } }
    : { draft: { ...draft, summary: meeting.summary ?? '' }, revisions: { ...revisions, summary: meeting.summaryRevision } }
}

/**
 * Reports whether leaving the workspace would discard an unsaved text draft.
 *
 * Args:
 *   dirty: The independent text-field dirtiness flags in the open workspace.
 * Returns:
 *   True if a caller must obtain explicit discard confirmation.
 */
export function meetingHasDirtyDraft(dirty: MeetingDirtyFields): boolean {
  return dirty.transcript || dirty.summary
}

/**
 * Produces an honest, finite status for one persisted meeting lifecycle.
 *
 * Args:
 *   meeting: The current local cache record and backend processing statuses.
 * Returns:
 *   Copy that identifies the current stage or the recovery action; it never
 *   claims a task is generating after bounded polling has stopped.
 */
export function meetingProcessingLabel(meeting: Meeting): string {
  if (meeting.syncState === 'error') return 'Upload failed — retry when ready'
  if (meeting.transcriptStatus === 'failed') return 'Transcript failed — retry when ready'
  if (meeting.summaryStatus === 'failed') return 'Summary failed — retry when ready'
  if (meeting.syncState === 'pending') return 'Waiting to sync'
  if (meeting.transcriptStatus === 'pending' || meeting.transcriptStatus === 'running') return 'Preparing transcript…'
  if (meeting.summaryStatus === 'pending' || meeting.summaryStatus === 'running') return 'Preparing summary…'
  if (meeting.summaryStale) return 'Summary is out of date'
  return 'Ready'
}

/**
 * Reports whether any backend work still merits bounded refresh polling.
 *
 * Args:
 *   meeting: The current meeting record.
 * Returns:
 *   True only while transcript or summary work has an active server stage.
 */
export function meetingIsProcessing(meeting: Meeting): boolean {
  return meeting.transcriptStatus === 'pending' || meeting.transcriptStatus === 'running'
    || meeting.summaryStatus === 'pending' || meeting.summaryStatus === 'running'
}
