export {
  MAX_RECORDING_AUDIO_BYTES,
  MAX_RECORDING_DURATION_MS,
  RecorderProvider,
  useRecorder,
  type RecorderContextValue,
  type RecorderProviderProps,
  type RecorderState,
  type RecordingStartOptions,
  type RecordingSubmission,
  type RecordingSubmissionResult,
} from './RecorderProvider';
export { RecorderControls, type RecorderControlsProps } from './RecorderControls';
export { formatRecordingDuration } from './format';
export { RecordingOverlay, type RecordingOverlayProps, type RecordingOverlayState } from './RecordingOverlay';
export { TransformPopup } from './TransformPopup';
export { TutorialRecorder, type TutorialRecorderProps } from './TutorialRecorder';
export { CaptureGenerationController, isCapturing, type RecordingPhase } from './lifecycle';
export { encodePcm16MonoWav, wavByteLength, PCM16_BYTES_PER_SAMPLE, WAV_HEADER_BYTES, type PcmFrames } from './wav';
