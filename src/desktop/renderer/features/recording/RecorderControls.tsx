import type { CSSProperties } from 'react';

import { formatRecordingDuration } from './format';
import type { RecordingStartOptions } from './RecorderProvider';
import { useRecorder } from './RecorderProvider';

export interface RecorderControlsProps extends RecordingStartOptions {
  className?: string;
  startLabel?: string;
  stopLabel?: string;
  showCancel?: boolean;
}

const meterTrack: CSSProperties = {
  height: 6,
  borderRadius: 999,
  overflow: 'hidden',
  background: 'color-mix(in srgb, currentColor 15%, transparent)',
};

/**
 * Presents hub controls for a recording owned by RecorderProvider.
 * The controls request lifecycle actions from main; they never open a microphone directly.
 */
export function RecorderControls({
  className,
  microphoneId,
  startLabel = 'Start recording',
  stopLabel = 'Stop recording',
  showCancel = true,
}: RecorderControlsProps): React.JSX.Element {
  const recorder = useRecorder();
  const isRecording = recorder.phase === 'recording';
  const busy = recorder.phase === 'starting' || recorder.phase === 'stopping' || recorder.phase === 'processing';
  const canStart = recorder.phase === 'idle' || recorder.phase === 'error';

  return (
    <section className={['recorder-controls', className].filter(Boolean).join(' ')} aria-label="Dictation recorder">
      <div className="recorder-controls__status" aria-live="polite" aria-atomic="true">
        <strong>{isRecording ? `${formatRecordingDuration(recorder.elapsedMs)} recording` : recorder.message}</strong>
        {recorder.error ? <p role="alert">{recorder.error}</p> : null}
      </div>
      <div className="recorder-controls__meter" aria-label={`Audio level ${Math.round(recorder.level * 100)} percent`} style={meterTrack}>
        <div style={{ width: `${Math.round(recorder.level * 100)}%`, height: '100%', background: 'currentColor', transition: 'width 80ms linear' }} />
      </div>
      <small className="recorder-controls__metrics">{formatRecordingDuration(recorder.elapsedMs)} · {Math.ceil(recorder.audioBytes / 1024)} KiB</small>
      <div className="recorder-controls__actions">
        {canStart ? (
          <button className="button button--primary" type="button" onClick={() => void recorder.start({ microphoneId })}>
            {recorder.phase === 'error' ? 'Try again' : startLabel}
          </button>
        ) : (
          <button className="button button--primary" type="button" disabled={!isRecording} onClick={() => void recorder.stop()}>
            {busy ? recorder.message : stopLabel}
          </button>
        )}
        {showCancel && recorder.phase !== 'idle' ? (
          <button className="button button--quiet" type="button" disabled={busy && recorder.phase === 'stopping'} onClick={() => void recorder.cancel()}>
            Cancel
          </button>
        ) : null}
      </div>
    </section>
  );
}
