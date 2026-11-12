import type { RecordingState } from '../../shared/contracts';

/** A capture phase the hub reports for the dictation it is recording. */
export interface RecordingPhaseReport {
  capturePhase: RecordingState['capturePhase'];
  error?: string;
}

/**
 * Applies one hub-reported capture phase to main's dictation state.
 *
 * Args:
 *   current: Main's dictation state when the report arrives.
 *   report: The phase the hub reported, with its error text for a failure.
 * Returns:
 *   The next state, or `current` itself when the report must be ignored.
 */
export function applyRecordingPhaseReport(current: RecordingState, report: RecordingPhaseReport): RecordingState {
  // A cancelled renderer may finish reporting after main has returned to idle.
  if (current.status === 'idle' && ['failed', 'submitted'].includes(report.capturePhase)) return current;
  // Main records a finished take itself when submit resolves, so "submitted" only confirms a take that
  // is still processing. Arriving later, it belongs to the previous take and must not end the next one.
  if (report.capturePhase === 'submitted' && current.status !== 'processing') return current;
  const status = report.capturePhase === 'capturing'
    ? 'recording'
    : report.capturePhase === 'submitting'
      ? 'processing'
      : report.capturePhase === 'failed'
        ? 'error'
        : ['idle', 'submitted', 'cancelled'].includes(report.capturePhase)
          ? 'idle'
          : current.status;
  return {
    ...current,
    capturePhase: report.capturePhase,
    error: report.error ?? (status === 'error' ? 'Recording failed.' : null),
    startedAt: status === 'idle' || status === 'error' ? null : current.startedAt,
    status,
  };
}
