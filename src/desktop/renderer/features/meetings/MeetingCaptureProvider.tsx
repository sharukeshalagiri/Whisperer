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
  Meeting,
  MeetingCaptureCommand,
  MeetingCaptureState,
} from '../../../shared/contracts';

import { AudioMeterEnvelope } from '../recording/meter';
import { CaptureGenerationController, SerializedChunkQueue } from './lifecycle';

/** Reference status-bar meter cadence; values are display-only and never persisted. */
const METER_INTERVAL_MS = 150;

/** Provides a live, renderer-owned local meeting microphone capture. */
export interface MeetingCaptureProviderProps extends PropsWithChildren {
  /** The preferred microphone; omitted or null selects the operating-system default. */
  microphoneId?: string | null;
}

/** Represents the state and narrow actions available to meeting UI. */
export interface MeetingCaptureContextValue {
  /** Active local capture state, or null when no meeting is capturing. */
  state: MeetingCaptureState | null;
  /** Renderer-side capture failure suitable for inline display. */
  recordingError: string | null;
  /** Requests creation and capture of a local meeting with the supplied title. */
  start: (title: string) => Promise<void>;
  /** Requests finalization of the active local capture. */
  stop: () => Promise<void>;
  /** Discards the active local capture and its partial audio. */
  cancel: () => Promise<void>;
  /** Opens the platform picker to import a local audio file. */
  importAudio: () => Promise<Meeting | null>;
  /** Opens the platform picker to export a meeting's local microphone audio. */
  exportAudio: (id: string) => Promise<void>;
}

interface CaptureRuntime {
  command: MeetingCaptureCommand;
  generation: number;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  meterContext: AudioContext | null;
  meterTimer: number | null;
  queue: SerializedChunkQueue;
  startedAt: number;
  stopRequested: boolean;
  cancelled: boolean;
}

const MeetingCaptureContext = createContext<MeetingCaptureContextValue | null>(null);

/** Reads the restricted desktop bridge without exposing Electron primitives. */
function meetingBridge(): DesktopApi | undefined {
  return (globalThis as typeof globalThis & { whisperer?: DesktopApi }).whisperer;
}

/** Selects the exact microphone only when the person chose a device. */
function microphoneConstraints(microphoneId?: string): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {};
  if (microphoneId) audio.deviceId = { exact: microphoneId };
  return { audio, video: false };
}

/** Converts a thrown browser or bridge error into safe inline feedback. */
function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was denied. Allow microphone access and try again.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'The selected microphone is unavailable. Choose another microphone and try again.';
  }
  return error instanceof Error && error.message ? error.message : 'Meeting recording could not be completed.';
}

/** Opus at 24 kbit/s is ample for speech and keeps a two-hour segment under the 25 MB upload cap. */
const MEETING_AUDIO_BITS_PER_SECOND = 24_000

/** Picks WebM when the browser advertises a concrete audio-only recording type. */
function mediaRecorderOptions(): MediaRecorderOptions {
  const preferred = 'audio/webm;codecs=opus';
  const mimeType = MediaRecorder.isTypeSupported(preferred) ? preferred : 'audio/webm';
  return { mimeType, audioBitsPerSecond: MEETING_AUDIO_BITS_PER_SECOND };
}

/** Samples the already-open meeting stream for the overlay without creating another microphone request. */
function startMeter(capture: CaptureRuntime, stream: MediaStream): void {
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const envelope = new AudioMeterEnvelope();
    capture.meterContext = context;
    capture.meterTimer = window.setInterval(() => {
      if (capture.cancelled || capture.stopRequested) return;
      analyser.getFloatTimeDomainData(samples);
      const elapsedMs = Math.max(0, Math.round(performance.now() - capture.startedAt));
      void meetingBridge()?.recording.reportMeter({ level: envelope.measure(samples), elapsedMs, source: 'meeting' }).catch(() => undefined);
    }, METER_INTERVAL_MS);
  } catch {
    // The meter is presentation-only; meeting capture continues with a flat waveform.
  }
}

/** Captures microphone-only WebM chunks for a meeting created by the main process. */
export function MeetingCaptureProvider({ children, microphoneId = null }: MeetingCaptureProviderProps): React.JSX.Element {
  const [state, setState] = useState<MeetingCaptureState | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mounted = useRef(true);
  const runtime = useRef<CaptureRuntime | null>(null);
  const controller = useRef(new CaptureGenerationController());

  /** Applies UI state only while the authenticated hub remains mounted. */
  const updateState = useCallback((next: MeetingCaptureState | null): void => {
    if (mounted.current) setState(next);
  }, []);

  /** Releases browser microphone resources without creating any more chunks. */
  const release = useCallback((capture: CaptureRuntime): void => {
    capture.cancelled = true;
    if (capture.meterTimer !== null) window.clearInterval(capture.meterTimer);
    capture.meterTimer = null;
    void capture.meterContext?.close().catch(() => undefined);
    capture.meterContext = null;
    if (capture.recorder?.state === 'recording') capture.recorder.stop();
    capture.stream?.getTracks().forEach((track) => track.stop());
    capture.stream = null;
    capture.recorder = null;
  }, []);

  /** Reports a terminal renderer failure and releases the matching main-process mutex. */
  const failCapture = useCallback(async (capture: CaptureRuntime, error: unknown): Promise<void> => {
    if (!controller.current.isCurrent(capture.generation)) return;
    const message = errorMessage(error);
    controller.current.cancel();
    if (runtime.current === capture) runtime.current = null;
    release(capture);
    if (mounted.current) {
      setRecordingError(message);
      setState({ id: capture.command.id, title: capture.command.title, status: 'error', startedAt: new Date().toISOString(), error: message });
    }
    const bridge = meetingBridge();
    try {
      await bridge?.meetings.capture.fail({ id: capture.command.id, error: message });
    } catch {
      await bridge?.meetings.capture.cancel().catch(() => undefined);
    }
  }, [release]);

  /** Finalizes the chunk queue, then attaches the actual measured duration to the meeting. */
  const finishCapture = useCallback(async (capture: CaptureRuntime): Promise<void> => {
    if (!controller.current.isCurrent(capture.generation) || capture.cancelled) return;
    try {
      await capture.queue.drain();
      if (!controller.current.isCurrent(capture.generation) || capture.cancelled) return;
      const durationMs = Math.max(0, Math.round(performance.now() - capture.startedAt));
      const contentType = capture.recorder?.mimeType || 'audio/webm';
      release(capture);
      if (runtime.current === capture) runtime.current = null;
      await meetingBridge()?.meetings.capture.finish({ id: capture.command.id, durationMs, contentType });
      if (controller.current.isCurrent(capture.generation)) {
        controller.current.cancel();
        updateState(null);
        if (mounted.current) setRecordingError(null);
      }
    } catch (error) {
      await failCapture(capture, error);
    }
  }, [failCapture, release, updateState]);

  /** Acquires microphone-only capture only after a main-process start command. */
  const beginCapture = useCallback(async (command: MeetingCaptureCommand): Promise<void> => {
    if (runtime.current?.command.id === command.id) return;
    const prior = runtime.current;
    if (prior) {
      controller.current.cancel();
      runtime.current = null;
      release(prior);
    }

    const generation = controller.current.begin();
    const capture: CaptureRuntime = {
      command,
      generation,
      stream: null,
      recorder: null,
      meterContext: null,
      meterTimer: null,
      queue: new SerializedChunkQueue(),
      startedAt: 0,
      stopRequested: false,
      cancelled: false,
    };
    runtime.current = capture;
    updateState((state && state.id === command.id) ? state : {
      id: command.id,
      title: command.title,
      status: 'starting',
      startedAt: new Date().toISOString(),
      error: null,
    });
    if (mounted.current) setRecordingError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints(microphoneId ?? undefined));
      if (!controller.current.isCurrent(generation) || capture.cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      capture.stream = stream;
      const recorder = new MediaRecorder(stream, mediaRecorderOptions());
      capture.recorder = recorder;
      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (!event.data.size || !controller.current.isCurrent(generation) || capture.cancelled) return;
        capture.queue.append(async () => {
          const audio = new Uint8Array(await event.data.arrayBuffer());
          if (!controller.current.isCurrent(generation) || capture.cancelled) return;
          await meetingBridge()?.meetings.capture.appendChunk({ id: command.id, audio });
        });
      });
      recorder.addEventListener('stop', () => { void finishCapture(capture); }, { once: true });
      recorder.start(1_000);
      capture.startedAt = performance.now();
      startMeter(capture, stream);
      updateState({ id: command.id, title: command.title, status: 'recording', startedAt: new Date().toISOString(), error: null });
      if (capture.stopRequested) recorder.stop();
    } catch (error) {
      await failCapture(capture, error);
    }
  }, [failCapture, finishCapture, microphoneId, release, state, updateState]);

  /** Stops an active recorder, or marks a still-pending microphone request for immediate stop. */
  const stopCapture = useCallback((command: MeetingCaptureCommand): void => {
    const capture = runtime.current;
    if (!capture || capture.command.id !== command.id || capture.cancelled) return;
    capture.stopRequested = true;
    updateState((state && state.id === command.id) ? { ...state, status: 'stopping', error: null } : {
      id: command.id,
      title: command.title,
      status: 'stopping',
      startedAt: new Date().toISOString(),
      error: null,
    });
    if (capture.recorder?.state === 'recording') capture.recorder.stop();
  }, [state, updateState]);

  /** Invalidates in-flight acquisition and immediately releases browser capture. */
  const cancelCapture = useCallback((command?: MeetingCaptureCommand): void => {
    const capture = runtime.current;
    if (!capture || (command && capture.command.id !== command.id)) return;
    controller.current.cancel();
    runtime.current = null;
    release(capture);
    updateState(null);
    if (mounted.current) setRecordingError(null);
  }, [release, updateState]);

  /** Requests main to create a local meeting before browser microphone access begins. */
  const start = useCallback(async (title: string): Promise<void> => {
    try {
      const next = await meetingBridge()?.meetings.capture.start({ title });
      if (!next) throw new Error('The desktop meeting service is unavailable.');
      updateState(next);
      if (mounted.current) setRecordingError(null);
    } catch (error) {
      if (mounted.current) setRecordingError(errorMessage(error));
    }
  }, [updateState]);

  /** Requests stop through main so it remains the mutual-exclusion authority. */
  const stop = useCallback(async (): Promise<void> => {
    try {
      const next = await meetingBridge()?.meetings.capture.stop();
      updateState(next ?? null);
    } catch (error) {
      if (mounted.current) setRecordingError(errorMessage(error));
    }
  }, [updateState]);

  /** Requests cancellation through main so its partial file and mutex are released. */
  const cancel = useCallback(async (): Promise<void> => {
    try {
      await meetingBridge()?.meetings.capture.cancel();
    } catch (error) {
      if (mounted.current) setRecordingError(errorMessage(error));
    }
  }, []);

  /** Opens the native import picker through the restricted bridge. */
  const importAudio = useCallback(async (): Promise<Meeting | null> => {
    const bridge = meetingBridge();
    if (!bridge) throw new Error('The desktop meeting service is unavailable.');
    return bridge.meetings.importAudio();
  }, []);

  /** Opens the native export picker through the restricted bridge. */
  const exportAudio = useCallback(async (id: string): Promise<void> => {
    const bridge = meetingBridge();
    if (!bridge) throw new Error('The desktop meeting service is unavailable.');
    await bridge.meetings.exportAudio(id);
  }, []);

  useEffect(() => {
    const bridge = meetingBridge();
    const unsubscribeCommand = bridge?.events.onMeetingCaptureCommand((command) => {
      if (command.command === 'start') void beginCapture(command);
      if (command.command === 'stop') stopCapture(command);
      if (command.command === 'cancel') cancelCapture(command);
    });
    const unsubscribeState = bridge?.events.onState((next) => {
      const capture = runtime.current;
      if (!capture || next.meetingCapture === null || next.meetingCapture.id !== capture.command.id || next.meetingCapture.status === 'error') {
        updateState(next.meetingCapture);
        if (next.meetingCapture?.status === 'error' && mounted.current) setRecordingError(next.meetingCapture.error);
      }
    });
    return () => {
      unsubscribeCommand?.();
      unsubscribeState?.();
    };
  }, [beginCapture, cancelCapture, stopCapture, updateState]);

  useEffect(() => {
    const captureController = controller.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      const capture = runtime.current;
      if (!capture) return;
      captureController.cancel();
      runtime.current = null;
      release(capture);
      void meetingBridge()?.meetings.capture.cancel().catch(() => undefined);
    };
  }, [release]);

  const value = useMemo<MeetingCaptureContextValue>(() => ({
    state,
    recordingError,
    start,
    stop,
    cancel,
    importAudio,
    exportAudio,
  }), [cancel, exportAudio, importAudio, recordingError, start, state, stop]);

  return <MeetingCaptureContext.Provider value={value}>{children}</MeetingCaptureContext.Provider>;
}

/** Returns the mounted authenticated-hub meeting capture capability. */
export function useMeetingCapture(): MeetingCaptureContextValue {
  const context = useContext(MeetingCaptureContext);
  if (!context) throw new Error('useMeetingCapture must be used inside MeetingCaptureProvider.');
  return context;
}
