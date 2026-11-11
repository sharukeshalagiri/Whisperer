/** The server's per-segment upload cap (MeetingService max_segment_bytes). */
export const MEETING_SEGMENT_MAX_BYTES = 25 * 1024 * 1024;
/** Stop a little early so the recorder's final chunks still fit under the cap. */
const STOP_AT_BYTES = 24 * 1024 * 1024;
/** On-device transcription decodes at most two hours per segment (audio.py). */
const STOP_AT_MS = 2 * 60 * 60 * 1000 - 60 * 1000;

/**
 * Decide what to do with one recorded meeting chunk so every segment stays uploadable.
 *
 * Args:
 *   segmentBytes: Bytes already written to the current segment.
 *   chunkBytes: Size of the chunk that just arrived.
 *   elapsedMs: Time since the segment started.
 * Returns:
 *   `append` when the chunk fits under the server cap, and `stop` when the meeting should be
 *   finished now (it keeps everything recorded so far; Resume starts a new segment).
 */
export function meetingChunkDecision(segmentBytes: number, chunkBytes: number, elapsedMs: number): { append: boolean; stop: boolean } {
  const total = segmentBytes + chunkBytes;
  if (total > MEETING_SEGMENT_MAX_BYTES) return { append: false, stop: true };
  return { append: true, stop: total >= STOP_AT_BYTES || elapsedMs >= STOP_AT_MS };
}
