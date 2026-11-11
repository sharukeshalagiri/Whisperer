import { describe, expect, test } from 'vitest';

import { MEETING_SEGMENT_MAX_BYTES, meetingChunkDecision } from './MeetingCaptureLimits';

const MiB = 1024 * 1024;

describe('meetingChunkDecision', () => {
  test('appends ordinary chunks without stopping', () => {
    expect(meetingChunkDecision(1 * MiB, 64 * 1024, 60_000)).toEqual({ append: true, stop: false });
  });

  test('finishes the meeting before a segment can exceed the server upload cap', () => {
    expect(meetingChunkDecision(24 * MiB - 10, 20, 60_000)).toEqual({ append: true, stop: true });
    expect(meetingChunkDecision(MEETING_SEGMENT_MAX_BYTES - 5, 10, 60_000)).toEqual({ append: false, stop: true });
  });

  test('finishes a segment before the two-hour on-device transcription limit', () => {
    expect(meetingChunkDecision(1 * MiB, 1024, 2 * 60 * 60 * 1000 - 30_000)).toEqual({ append: true, stop: true });
  });
});
