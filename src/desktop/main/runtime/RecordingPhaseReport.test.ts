import { describe, expect, test } from 'vitest';

import type { RecordingState } from '../../shared/contracts';
import { applyRecordingPhaseReport } from './RecordingPhaseReport';

const idle: RecordingState = { status: 'idle', capturePhase: 'submitted', startedAt: null, error: null };
const starting: RecordingState = { status: 'starting', capturePhase: 'capturing', startedAt: '2026-11-12T04:06:55.000Z', error: null };
const recording: RecordingState = { ...starting, status: 'recording' };
const processing: RecordingState = { ...starting, status: 'processing', capturePhase: 'submitting' };

describe('applyRecordingPhaseReport', () => {
  test('follows the hub through one take', () => {
    expect(applyRecordingPhaseReport(starting, { capturePhase: 'capturing' }, 2).status).toBe('recording');
    expect(applyRecordingPhaseReport(recording, { capturePhase: 'submitting' }, 2).status).toBe('processing');
    expect(applyRecordingPhaseReport(processing, { capturePhase: 'submitted' }, 2)).toMatchObject({ status: 'idle', startedAt: null });
  });

  test('a late "submitted" from the previous take does not end a take that has just started', () => {
    // Main records the result itself when submit resolves; a fast next press can start a take
    // before the hub's own "submitted" report for the old take arrives (seen on Windows as
    // "No recording is active." when the new take was stopped).
    expect(applyRecordingPhaseReport(starting, { capturePhase: 'submitted' }, 2)).toBe(starting);
    expect(applyRecordingPhaseReport(recording, { capturePhase: 'submitted' }, 2)).toBe(recording);
  });

  test('ignores late terminal reports after main returned to idle', () => {
    expect(applyRecordingPhaseReport(idle, { capturePhase: 'submitted' }, 2)).toBe(idle);
    expect(applyRecordingPhaseReport(idle, { capturePhase: 'failed', error: 'x' }, 2)).toBe(idle);
  });

  test('still surfaces a microphone failure of the take that is starting', () => {
    expect(applyRecordingPhaseReport(starting, { capturePhase: 'failed', error: 'No microphone' }, 2)).toMatchObject({ status: 'error', error: 'No microphone', startedAt: null });
  });

  test('reports from an earlier take never change the take that is running', () => {
    // Cancel then a quick start, or a failed submit then a quick start: the hub's late report for
    // take 1 arrives after main started take 2.
    for (const capturePhase of ['cancelled', 'failed', 'idle', 'submitted'] as const) {
      expect(applyRecordingPhaseReport(starting, { capturePhase, take: 1 }, 2)).toBe(starting);
      expect(applyRecordingPhaseReport(recording, { capturePhase, take: 1 }, 2)).toBe(recording);
    }
    expect(applyRecordingPhaseReport(starting, { capturePhase: 'failed', error: 'No microphone', take: 2 }, 2)).toMatchObject({ status: 'error', error: 'No microphone' });
    expect(applyRecordingPhaseReport(starting, { capturePhase: 'capturing', take: 2 }, 2).status).toBe('recording');
  });

  test('an empty take returns to idle from stopping', () => {
    const stopping: RecordingState = { ...starting, status: 'stopping', capturePhase: 'captured' };
    expect(applyRecordingPhaseReport(stopping, { capturePhase: 'idle' }, 2).status).toBe('idle');
  });
});
