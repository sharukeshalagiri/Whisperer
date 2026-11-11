import type { LocalStore } from '../storage/LocalStore';

/** The outbox operations a finished segment needs. */
export interface MeetingQueue {
  queueSegment(meetingId: string, segmentId: string): void;
  queueFinish(meetingId: string): void;
}

/** One meeting recording session as main tracks it. */
export interface CaptureRecord {
  id: string;
  title: string;
  file: string;
  bytes: number;
  createdAt: number;
  segmentId: string;
}

/**
 * Store a captured segment as finished and queue its upload, in one local transaction.
 *
 * Used by the normal Stop path and when a recording ends without it (quit, crash, renderer loss),
 * so audio already on disk is kept rather than deleted or stranded.
 *
 * Args:
 *   store: Scoped local store.
 *   queue: Meeting outbox.
 *   capture: The capture being finished; `bytes` must be greater than zero.
 *   durationMs: Recorded duration of this segment.
 *   contentType: MIME type of the segment file.
 *   language: Language for a segment that has none saved yet.
 *   now: Current time in epoch milliseconds.
 */
export function finalizeCapture(store: LocalStore, queue: MeetingQueue, capture: CaptureRecord, durationMs: number, contentType: string, language: string, now: number): void {
  const roundedDuration = Math.max(0, Math.round(durationMs));
  store.transaction(() => {
    const prior = store.getMeeting(capture.id);
    store.saveMeeting({
      ...(prior ?? { transcript: '', summary: '', syncState: 'pending', transcriptStatus: 'pending', summaryStatus: 'idle' }),
      id: capture.id, title: capture.title, createdAt: prior?.createdAt ?? capture.createdAt,
      durationMs: (prior?.durationMs ?? 0) + roundedDuration, endedAt: now, status: 'complete', audioPath: capture.file, syncState: 'pending',
    });
    const existingSegment = store.listMeetingSegments(capture.id).find((segment) => segment.id === capture.segmentId);
    store.saveMeetingSegment({ id: capture.segmentId, meetingId: capture.id, audioPath: capture.file, contentType, createdAt: capture.createdAt, durationMs: roundedDuration, language: existingSegment?.language ?? language, status: 'pending' });
    queue.queueSegment(capture.id, capture.segmentId);
    queue.queueFinish(capture.id);
  });
}

/**
 * Finish every segment a crash or forced quit left in `recording`, keeping its audio.
 *
 * Args:
 *   store: Scoped local store.
 *   queue: Meeting outbox.
 *   fileInfo: Returns a segment file's size and modification time, or null when it is missing.
 *   discard: Removes an empty segment's file and metadata.
 * Returns:
 *   The meeting ids whose audio was recovered.
 */
export function recoverInterruptedMeetings(
  store: LocalStore,
  queue: MeetingQueue,
  fileInfo: (path: string) => { size: number; modifiedAt: number } | null,
  discard: (meetingId: string, segmentId: string, path: string | undefined) => void,
): string[] {
  const recovered: string[] = [];
  for (const segment of store.listRecordingSegments()) {
    const info = segment.audioPath ? fileInfo(segment.audioPath) : null;
    if (!info || info.size === 0 || !segment.audioPath) {
      discard(segment.meetingId, segment.id, segment.audioPath);
      continue;
    }
    const meeting = store.getMeeting(segment.meetingId);
    const capture: CaptureRecord = { id: segment.meetingId, title: meeting?.title ?? '', file: segment.audioPath, bytes: info.size, createdAt: segment.createdAt, segmentId: segment.id };
    finalizeCapture(store, queue, capture, info.modifiedAt - segment.createdAt, segment.contentType, segment.language, info.modifiedAt);
    recovered.push(segment.meetingId);
  }
  return recovered;
}

/**
 * Remove a cancelled capture's segment and settle its meeting.
 *
 * A new meeting with nothing else recorded is deleted with its queued operations. A resumed
 * meeting keeps its earlier segments, and a finish is queued so the server closes the meeting
 * the resume re-opened.
 *
 * Args:
 *   store: Scoped local store.
 *   queue: Meeting outbox.
 *   capture: The cancelled capture.
 * Returns:
 *   Whether the whole meeting was removed.
 */
export function cancelCaptureRecords(store: LocalStore, queue: MeetingQueue, capture: CaptureRecord): boolean {
  return store.transaction(() => {
    store.deleteMeetingSegment(capture.segmentId);
    store.discardOutboxForEntity(capture.segmentId);
    if (store.listMeetingSegments(capture.id).length === 0) {
      store.discardOutboxForEntity(capture.id);
      store.deleteMeeting(capture.id);
      return true;
    }
    const meeting = store.getMeeting(capture.id);
    if (meeting) store.saveMeeting({ ...meeting, status: 'complete', syncState: 'pending' });
    queue.queueFinish(capture.id);
    return false;
  });
}
