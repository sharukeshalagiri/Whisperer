import { describe, expect, test } from 'vitest';

import type { RecordingState } from '../../shared/contracts';
import { applyRecordingPhaseReport } from './RecordingPhaseReport';

const idle: RecordingState = { status: 'idle', capturePhase: 'submitted', startedAt: null, error: null };
const starting: RecordingState = { status: 'starting', capturePhase: 'capturing', startedAt: '2026-11-12T04:06:55.000Z', error: null };
const recording: RecordingState = { ...starting, status: 'recording' };
const processing: RecordingState = { ...starting, status: 'processing', capturePhase: 'submitting' };

describe('applyRecordingPhaseReport', () => {
  test('follows the hub through one take', () => {
    expect(applyRecordingPhaseReport(starting, { capturePhase: 'capturing' }).status).toBe('recording');
    expect(applyRecordingPhaseReport(recording, { capturePhase: 'submitting' }).status).toBe('processing');
    expect(applyRecordingPhaseReport(processing, { capturePhase: 'submitted' })).toMatchObject({ status: 'idle', startedAt: null });
  });

  test('a late "submitted" from the previous take does not end a take that has just started', () => {
    // Main records the result itself when submit resolves; a fast next press can start a take
    // before the hub's own "submitted" report for the old take arrives (seen on Windows as
    // "No recording is active." when the new take was stopped).
    expect(applyRecordingPhaseReport(starting, { capturePhase: 'submitted' })).toBe(starting);
    expect(applyRecordingPhaseReport(recording, { capturePhase: 'submitted' })).toBe(recording);
  });

  test('ignores late terminal reports after main returned to idle', () => {
    expect(applyRecordingPhaseReport(idle, { capturePhase: 'submitted' })).toBe(idle);
    expect(applyRecordingPhaseReport(idle, { capturePhase: 'failed', error: 'x' })).toBe(idle);
  });

  test('still surfaces a microphone failure of the take that is starting', () => {
    expect(applyRecordingPhaseReport(starting, { capturePhase: 'failed', error: 'No microphone' })).toMatchObject({ status: 'error', error: 'No microphone', startedAt: null });
  });

  test('an empty take returns to idle from stopping', () => {
    const stopping: RecordingState = { ...starting, status: 'stopping', capturePhase: 'captured' };
    expect(applyRecordingPhaseReport(stopping, { capturePhase: 'idle' }).status).toBe('idle');
  });
});
