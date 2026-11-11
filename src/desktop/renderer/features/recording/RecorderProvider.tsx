import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  DesktopApi,
  RecordingCapturePhase,
  RecordingSubmissionResult,
} from '../../../shared/contracts';

import { CaptureGenerationController, type RecordingPhase } from './lifecycle';
import pcmWorkletUrl from './pcm-worklet.js?url&no-inline';
import { AudioMeterEnvelope } from './meter';
import { encodePcm16MonoWav, PCM16_BYTES_PER_SAMPLE, WAV_HEADER_BYTES } from './wav';

export const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000;
export const MAX_RECORDING_AUDIO_BYTES = 25 * 1024 * 1024;
const METER_INTERVAL_MS = 150;

export interface RecordingStartOptions {
  /** Constrains capture to this browser media-device ID when supplied. */
  microphoneId?: string;
}

/** The result is owned by the shared IPC contract and persisted as history. */
export type { RecordingSubmission, RecordingSubmissionResult } from '../../../shared/contracts';

export interface RecorderState {
  phase: RecordingPhase;
  level: number;
  elapsedMs: number;
  audioBytes: number;
  maxDurationMs: number;
  maxAudioBytes: number;
  message: string;
  error: string | null;
  result: RecordingSubmissionResult | null;
}

export interface RecorderContextValue extends RecorderState {
  /** Requests that the main recording controller begin capture. */
  start: (options?: RecordingStartOptions) => Promise<void>;
  /** Requests that the main recording controller flush and finish capture. */
  stop: () => Promise<void>;
  /** Requests that the main recording controller cancel capture or submission. */
  cancel: () => Promise<void>;
  /** Clears an error and requests another microphone capture. */
  retry: (options?: RecordingStartOptions) => Promise<void>;
}

export interface RecorderProviderProps extends PropsWithChildren {
  /** The preferred microphone; omitted or null selects the operating-system default. */
  microphoneId?: string | null;
  /** Caps capture time; values above the product maximum are ignored. */
  maximumDurationMs?: number;
  /** Caps the final WAV file; values above 25 MiB are ignored. */
  maximumAudioBytes?: number;
  /** Enables a focused-window press-and-hold key without stealing text-input keys. */
  keyboardHold?: { enabled?: boolean; key?: string };
}

interface CaptureRuntime {
  generation: number;
  stream: MediaStream | null;
  context: AudioContext | null;
  source: MediaStreamAudioSourceNode | null;
  processor: AudioWorkletNode | null;
  silentGain: GainNode | null;
  frames: Float32Array[];
  frameCount: number;
  sampleRate: number;
  startedAt: number;
  stopping: boolean;
  stopRequested: boolean;
  durationTimer: number | null;
  elapsedTicker: number | null;
  flushResolver: (() => void) | null;
  meterReportedAt: number;
}

const RecorderContext = createContext<RecorderContextValue | null>(null);

const initialState = (maxDurationMs: number, maxAudioBytes: number): RecorderState => ({
  phase: 'idle',
  level: 0,
  elapsedMs: 0,
  audioBytes: WAV_HEADER_BYTES,
  maxDurationMs,
  maxAudioBytes,
  message: 'Ready to record.',
  error: null,
  result: null,
});

/** Reads the narrow preload API without exposing Electron primitives to React. */
function recordingBridge(): DesktopApi | undefined {
  return (globalThis as typeof globalThis & { whisperer?: DesktopApi }).whisperer;
}

/** Maps a UI lifecycle state to the process-neutral capture lifecycle contract. */
function capturePhaseFor(phase: RecordingPhase): RecordingCapturePhase {
  switch (phase) {
    case 'starting':
    case 'recording': return 'capturing';
    case 'stopping': return 'captured';
    case 'processing': return 'submitting';
    case 'error': return 'failed';
    case 'idle': return 'idle';
  }
}

/** Converts unknown thrown values into an inline, user-readable recorder error. */
function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was denied. Allow microphone access and try again.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'The selected microphone is unavailable. Choose another microphone and try again.';
  }
  return error instanceof Error && error.message ? error.message : 'Recording could not be completed. Try again.';
}

/** Makes the optional device constraint exact only when the caller selected a device. */
function microphoneConstraints(microphoneId?: string): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    channelCount: { ideal: 1 },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (microphoneId) audio.deviceId = { exact: microphoneId };
  return { audio, video: false };
}

/** Provides the single hub-owned microphone pipeline to hub, overlay, and tutorial UI. */
export function RecorderProvider({
  children,
  microphoneId = null,
  maximumDurationMs = MAX_RECORDING_DURATION_MS,
  maximumAudioBytes = MAX_RECORDING_AUDIO_BYTES,
  keyboardHold,
}: RecorderProviderProps): React.JSX.Element {
  const maxDurationMs = Math.min(Math.max(1, maximumDurationMs), MAX_RECORDING_DURATION_MS);
  const maxAudioBytes = Math.min(Math.max(WAV_HEADER_BYTES, maximumAudioBytes), MAX_RECORDING_AUDIO_BYTES);
  const [state, setState] = useState(() => initialState(maxDurationMs, maxAudioBytes));
  const mounted = useRef(true);
  const controller = useRef(new CaptureGenerationController());
  const runtime = useRef<CaptureRuntime | null>(null);
  const phase = useRef<RecordingPhase>('idle');
  const meter = useRef(new AudioMeterEnvelope());
  const pendingStartOptions = useRef<RecordingStartOptions>({ microphoneId: microphoneId ?? undefined });
  const limits = useRef({ maxDurationMs, maxAudioBytes });
  // Capture limits stop through main; the ref avoids a dependency cycle with the capture callbacks.
  const requestStopRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    limits.current = { maxDurationMs, maxAudioBytes };
  }, [maxAudioBytes, maxDurationMs]);

  const updateState = useCallback((update: Partial<RecorderState>) => {
    if (mounted.current) setState(current => ({ ...current, ...update }));
  }, []);

  const report = useCallback((nextPhase: RecordingPhase, update: Partial<RecorderState> = {}) => {
    phase.current = nextPhase;
    // Main has already published `starting`; only actual microphone readiness becomes `capturing`.
    if (nextPhase === 'starting') {
      updateState({ phase: nextPhase, ...update });
      return;
    }
    const capturePhase = capturePhaseFor(nextPhase);
    const reportPhase = recordingBridge()?.recording.reportPhase;
    void reportPhase?.({
      capturePhase,
      ...(capturePhase === 'failed' && update.error ? { error: update.error } : {}),
    }).catch(() => undefined);
    updateState({ phase: nextPhase, ...update });
  }, [updateState]);

  const release = useCallback(async (capture: CaptureRuntime): Promise<void> => {
    if (capture.durationTimer !== null) window.clearTimeout(capture.durationTimer);
    capture.durationTimer = null;
    if (capture.elapsedTicker !== null) window.clearInterval(capture.elapsedTicker);
    capture.elapsedTicker = null;
    capture.flushResolver?.();
    capture.flushResolver = null;
    capture.source?.disconnect();
    capture.processor?.disconnect();
    capture.silentGain?.disconnect();
    capture.stream?.getTracks().forEach(track => track.stop());
    const context = capture.context;
    capture.stream = null;
    capture.context = null;
    capture.source = null;
    capture.processor = null;
    capture.silentGain = null;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }, []);

  const cancelCapture = useCallback(async () => {
    controller.current.cancel();
    const capture = runtime.current;
    runtime.current = null;
    if (capture) {
      capture.frames.length = 0;
      capture.frameCount = 0;
      await release(capture);
    }
    void recordingBridge()?.recording.reportPhase({ capturePhase: 'cancelled' }).catch(() => undefined);
    phase.current = 'idle';
    updateState({ phase: 'idle', level: 0, elapsedMs: 0, audioBytes: WAV_HEADER_BYTES, error: null, result: null, message: 'Recording cancelled.' });
  }, [release, updateState]);

  const stopCapture = useCallback(async (generation?: number) => {
    const capture = runtime.current;
    if (!capture || (generation !== undefined && !controller.current.isCurrent(generation))) return;
    if (capture.stopping) return;
    capture.stopping = true;
    capture.stopRequested = true;
    report('stopping', { message: 'Finishing audio…', error: null });

    // A stop command can race getUserMedia or addModule. The start path resumes this stop.
    if (!capture.processor || !capture.context) return;

    if (capture.durationTimer !== null) window.clearTimeout(capture.durationTimer);
    capture.durationTimer = null;
    await new Promise<void>(resolve => {
      capture.flushResolver = resolve;
      capture.processor?.port.postMessage({ type: 'flush', generation: capture.generation });
    });
    if (!controller.current.isCurrent(capture.generation)) return;
    await recordingBridge()?.recording.reportPhase({ capturePhase: 'captured' });

    const durationMs = Math.min(
      limits.current.maxDurationMs,
      Math.round((capture.frameCount / capture.sampleRate) * 1000),
    );
    const frames = capture.frames;
    capture.frames = [];
    capture.frameCount = 0;
    await release(capture);
    if (runtime.current === capture) runtime.current = null;
    if (!controller.current.isCurrent(capture.generation)) return;

    if (!frames.length) {
      report('idle', { level: 0, elapsedMs: 0, audioBytes: WAV_HEADER_BYTES, message: 'No audio was captured.', error: null });
      return;
    }

    let audio: Uint8Array | null = null;
    try {
      report('processing', { level: 0, elapsedMs: durationMs, message: 'Transcribing…', error: null });
      audio = encodePcm16MonoWav(frames, capture.sampleRate);
      if (audio.byteLength > limits.current.maxAudioBytes) throw new Error('The recording exceeds the 25 MiB audio limit.');
      if (!controller.current.isCurrent(capture.generation)) return;
      const submit = recordingBridge()?.recording?.submit;
      if (!submit) throw new Error('The desktop recording service is unavailable.');
      const result = await submit({ audio, durationMs, filename: 'recording.wav', contentType: 'audio/wav' });
      if (!controller.current.isCurrent(capture.generation)) return;
      await recordingBridge()?.recording.reportPhase({ capturePhase: 'submitted' });
      phase.current = 'idle';
      updateState({
        phase: 'idle',
        level: 0,
        elapsedMs: durationMs,
        audioBytes: audio.byteLength,
        result: result ?? null,
        message: result?.historyEntry.pasted ? 'Dictation completed and pasted.' : 'Dictation completed and copied.',
        error: null,
      });
    } catch (error) {
      if (controller.current.isCurrent(capture.generation)) {
        report('error', { level: 0, message: errorMessage(error), error: errorMessage(error) });
      }
    } finally {
      audio?.fill(0);
      frames.length = 0;
    }
  }, [release, report, updateState]);

  const startCapture = useCallback(async (options: RecordingStartOptions = {}) => {
    if (phase.current !== 'idle' && phase.current !== 'error') return;
    const generation = controller.current.begin();
    meter.current.reset();
    const capture: CaptureRuntime = {
      generation,
      stream: null,
      context: null,
      source: null,
      processor: null,
      silentGain: null,
      frames: [],
      frameCount: 0,
      sampleRate: 0,
      startedAt: performance.now(),
      stopping: false,
      stopRequested: false,
      durationTimer: null,
      elapsedTicker: null,
      flushResolver: null,
      meterReportedAt: 0,
    };
    runtime.current = capture;
    report('starting', { level: 0, elapsedMs: 0, audioBytes: WAV_HEADER_BYTES, result: null, error: null, message: 'Requesting microphone…' });

    try {
      const stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints(options.microphoneId));
      if (!controller.current.isCurrent(generation)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      capture.stream = stream;
      const context = new AudioContext();
      capture.context = context;
      capture.sampleRate = context.sampleRate;
      await context.audioWorklet.addModule(pcmWorkletUrl);
      if (!controller.current.isCurrent(generation)) return;

      const processor = new AudioWorkletNode(context, 'whisperer-pcm-capture', { channelCount: 1, channelCountMode: 'explicit' });
      const source = context.createMediaStreamSource(stream);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      capture.processor = processor;
      capture.source = source;
      capture.silentGain = silentGain;
      processor.port.onmessage = ({ data }) => {
        if (!controller.current.isCurrent(generation)) return;
        if (data?.type === 'flushed' && data.generation === generation) {
          capture.flushResolver?.();
          capture.flushResolver = null;
          return;
        }
        // Frames arriving while stopping include the final flushed packet, so they are kept until release.
        if (data?.type !== 'frames' || !(data.frames instanceof Float32Array)) return;

        const maxFramesByBytes = Math.floor((limits.current.maxAudioBytes - WAV_HEADER_BYTES) / PCM16_BYTES_PER_SAMPLE);
        const maxFramesByDuration = Math.floor((limits.current.maxDurationMs * capture.sampleRate) / 1000);
        const permitted = Math.max(0, Math.min(maxFramesByBytes, maxFramesByDuration) - capture.frameCount);
        const frames = permitted < data.frames.length ? data.frames.slice(0, permitted) : data.frames;
        if (frames.length) {
          capture.frames.push(frames);
          capture.frameCount += frames.length;
          const elapsedMs = Math.min(limits.current.maxDurationMs, Math.round((capture.frameCount / capture.sampleRate) * 1000));
          const level = meter.current.measure(frames);
          updateState({
            level,
            elapsedMs,
            audioBytes: WAV_HEADER_BYTES + capture.frameCount * PCM16_BYTES_PER_SAMPLE,
          });
          // Only the hub reports these display-only values, throttled to the reference 150 ms cadence.
          const now = performance.now();
          if (!capture.stopping && now - capture.meterReportedAt >= METER_INTERVAL_MS) {
            capture.meterReportedAt = now;
            void recordingBridge()?.recording.reportMeter({ level, elapsedMs, source: 'dictation' }).catch(() => undefined);
          }
        }
        if (permitted < data.frames.length && !capture.stopping) void requestStopRef.current();
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);
      await context.resume();
      if (!controller.current.isCurrent(generation)) return;
      if (capture.stopRequested) {
        capture.stopping = false;
        await stopCapture(generation);
        return;
      }

      report('recording', { message: 'Recording…', error: null });
      capture.elapsedTicker = window.setInterval(() => {
        if (!controller.current.isCurrent(generation) || capture.stopping) return;
        updateState({ elapsedMs: Math.min(limits.current.maxDurationMs, Math.round(performance.now() - capture.startedAt)) });
      }, 250);
      // The duration limit stops through main so main state, overlay and capture stay consistent.
      capture.durationTimer = window.setTimeout(() => void requestStopRef.current(), limits.current.maxDurationMs);
    } catch (error) {
      if (!controller.current.isCurrent(generation)) return;
      runtime.current = null;
      await release(capture);
      report('error', { level: 0, message: errorMessage(error), error: errorMessage(error) });
    }
  }, [release, report, stopCapture, updateState]);

  const requestStart = useCallback(async (options: RecordingStartOptions = {}) => {
    const bridge = recordingBridge();
    if (!bridge) {
      report('error', { message: 'The desktop recording service is unavailable.', error: 'The desktop recording service is unavailable.' });
      return;
    }
    pendingStartOptions.current = { microphoneId: options.microphoneId ?? microphoneId ?? undefined };
    try {
      await bridge.recording.start();
    } catch (error) {
      report('error', { message: errorMessage(error), error: errorMessage(error) });
    }
  }, [microphoneId, report]);

  const requestStop = useCallback(async () => {
    try {
      await recordingBridge()?.recording?.stop?.();
    } catch (error) {
      report('error', { message: errorMessage(error), error: errorMessage(error) });
    }
  }, [report]);

  useEffect(() => {
    requestStopRef.current = requestStop;
  }, [requestStop]);

  const requestCancel = useCallback(async () => {
    try {
      await recordingBridge()?.recording?.cancel?.();
    } catch (error) {
      report('error', { message: errorMessage(error), error: errorMessage(error) });
    }
  }, [report]);

  useEffect(() => {
    const bridge = recordingBridge();
    const unsubscribe = bridge?.events.onRecordingCommand(command => {
      if (command === 'start') void startCapture(pendingStartOptions.current);
      if (command === 'stop') void stopCapture();
      if (command === 'cancel') void cancelCapture();
    });
    const unsubscribeState = bridge?.events.onState(nextState => {
      if (nextState.recording.status === 'error' && phase.current !== 'error') {
        report('error', { message: nextState.recording.error ?? 'Recording could not be completed.', error: nextState.recording.error ?? 'Recording could not be completed.' });
      }
    });
    return () => {
      unsubscribe?.();
      unsubscribeState?.();
    };
  }, [cancelCapture, report, startCapture, stopCapture]);

  useEffect(() => {
    if (!keyboardHold?.enabled) return;
    const key = keyboardHold.key ?? 'Space';
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (
      target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== key || event.repeat || editable(event.target)) return;
      void requestStart();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== key || editable(event.target)) return;
      void requestStop();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [keyboardHold?.enabled, keyboardHold?.key, requestStart, requestStop]);

  useEffect(() => {
    // StrictMode and remounts run cleanup then setup again; restore the guard on every setup.
    const captureController = controller.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      captureController.cancel();
      const capture = runtime.current;
      runtime.current = null;
      if (capture) void release(capture);
    };
  }, [release]);

  const value = useMemo<RecorderContextValue>(() => ({
    ...state,
    start: requestStart,
    stop: requestStop,
    cancel: requestCancel,
    retry: async options => {
      if (phase.current === 'error') report('idle', { error: null, message: 'Ready to record.' });
      await requestStart(options);
    },
  }), [report, requestCancel, requestStart, requestStop, state]);

  return <RecorderContext.Provider value={value}>{children}</RecorderContext.Provider>;
}

/** Returns the hub-owned recorder; descendants must be rendered below RecorderProvider. */
export function useRecorder(): RecorderContextValue {
  const context = useContext(RecorderContext);
  if (!context) throw new Error('useRecorder must be used inside RecorderProvider.');
  return context;
}
