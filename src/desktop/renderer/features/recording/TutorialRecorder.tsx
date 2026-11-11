import { useEffect, useRef } from 'react';

import type { RecordingStartOptions, RecordingSubmissionResult } from './RecorderProvider';
import { RecorderControls } from './RecorderControls';
import { useRecorder } from './RecorderProvider';

export interface TutorialRecorderProps extends RecordingStartOptions {
  className?: string;
  /** Called once after the tutorial capture has reached a successful terminal state. */
  onComplete?: (result: RecordingSubmissionResult | null) => void;
}

/**
 * Reuses the hub's recorder during onboarding without constructing another microphone pipeline.
 * Mount it below the same RecorderProvider as the hub rather than in the standalone overlay.
 */
export function TutorialRecorder({ className, microphoneId, onComplete }: TutorialRecorderProps): React.JSX.Element {
  const recorder = useRecorder();
  const completed = useRef<RecordingSubmissionResult | null | undefined>(undefined);

  useEffect(() => {
    if (recorder.phase !== 'idle' || !recorder.result || completed.current === recorder.result) return;
    completed.current = recorder.result;
    onComplete?.(recorder.result);
  }, [onComplete, recorder.phase, recorder.result]);

  return (
    <section className={className} aria-labelledby="tutorial-recorder-title">
      <h2 id="tutorial-recorder-title">Try a short dictation</h2>
      <p>Speak normally, then stop recording to confirm your microphone works.</p>
      <RecorderControls microphoneId={microphoneId} startLabel="Start tutorial recording" stopLabel="Finish tutorial recording" />
    </section>
  );
}
