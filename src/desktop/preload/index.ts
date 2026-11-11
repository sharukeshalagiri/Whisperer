/**
 * Sandboxed Electron preload bridge.
 *
 * The renderer receives this named API only. It never receives Electron,
 * Node, an unrestricted IPC sender, credentials, or IPC result envelopes.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  AccountSaveInput,
  AppMetric,
  AuthState,
  BootstrapState,
  Capabilities,
  Capability,
  CapabilityId,
  ConnectionMode,
  DataSyncResult,
  DesktopApi,
  DiagnosticsExport,
  UpdateStatus,
  DailyMetric,
  DictionaryEntry,
  DictionarySaveInput,
  HistoryEntry,
  InferenceTestResult,
  InferenceUpdate,
  LocalServerStatus,
  Meeting,
  MeetingCaptureCommand,
  MeetingCaptureState,
  MeetingQuestionAnswer,
  MeetingQuestionInput,
  MeetingSaveInput,
  MeetingTextSaveInput,
  Metrics,
  Note,
  NoteSaveInput,
  PublicSettings,
  PublicSettingsUpdate,
  RecordingCommand,
  RecordingMeter,
  RecordingPhaseReport,
  RecordingState,
  RecordingSubmission,
  RecordingSubmissionResult,
  Snippet,
  SnippetSaveInput,
  TransformDefinition,
  TransformDefinitionSaveInput,
  TransformReview,
  TransformationInput,
  TransformationResult,
  Unsubscribe,
  WindowState,
} from '../shared/contracts'
import {
  CHANNELS,
  EVENT_RUNTIME_SPECS,
  IPC_RUNTIME_SPECS,
  type EventChannel,
  type RequestChannel,
} from '../shared/protocol'

/** Represents a safe failure returned by a named desktop IPC operation. */
class DesktopIpcError extends Error {
  /** Creates a safe error from an IPC envelope or local validation failure. */
  constructor(
    /** Stable code suitable for renderer error handling. */
    readonly code: string,
    /** Safe message suitable for renderer error handling. */
    message: string,
  ) {
    super(message)
    this.name = 'DesktopIpcError'
  }
}

/** Invokes one validated, named request channel and unwraps its result envelope. */
async function invoke<T>(channel: RequestChannel, payload: unknown): Promise<T> {
  const spec = IPC_RUNTIME_SPECS[channel]
  const request = spec.request.safeParse(payload)

  if (!request.success) {
    throw new DesktopIpcError('INVALID_REQUEST', 'The desktop request was invalid.')
  }

  let rawResponse: unknown
  try {
    rawResponse = await ipcRenderer.invoke(channel, request.data)
  } catch {
    throw new DesktopIpcError('IPC_UNAVAILABLE', 'The desktop service is unavailable.')
  }

  const response = spec.response.safeParse(rawResponse)
  if (!response.success) {
    throw new DesktopIpcError('INVALID_RESPONSE', 'The desktop returned an invalid response.')
  }

  if (!response.data.ok) {
    throw new DesktopIpcError(response.data.error.code, response.data.error.message)
  }

  return response.data.data as T
}

/** Subscribes to one validated event channel and removes the exact listener later. */
function subscribe<T>(channel: EventChannel, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
    const parsed = EVENT_RUNTIME_SPECS[channel].payload.safeParse(payload)
    if (parsed.success) {
      listener(parsed.data as T)
    }
  }

  ipcRenderer.on(channel, handler)
  return (): void => {
    ipcRenderer.removeListener(channel, handler)
  }
}

/** Exposes the complete but deliberately narrow desktop renderer API. */
const desktopApi: DesktopApi = {
  /** Loads the renderer-safe application startup state. */
  bootstrap: (): Promise<BootstrapState> => invoke(CHANNELS.app.bootstrap, {}),
  auth: {
    /** Begins device authentication against an HTTP(S) API host. */
    signIn: (apiHost: string): Promise<AuthState> => invoke(CHANNELS.auth.signIn, { apiHost }),
    /** Cancels any pending device authentication. */
    cancel: (): Promise<AuthState> => invoke(CHANNELS.auth.cancel, {}),
    /** Removes local credentials and returns public signed-out state. */
    signOut: (): Promise<AuthState> => invoke(CHANNELS.auth.signOut, {}),
  },
  settings: {
    /** Persists renderer-editable settings and returns all public settings. */
    update: (partial: PublicSettingsUpdate): Promise<PublicSettings> =>
      invoke(CHANNELS.settings.update, partial),
    /** Suspends or restores native shortcuts while a recorder captures keys. */
    setShortcutCapture: (active: boolean): Promise<void> =>
      invoke(CHANNELS.settings.shortcutCapture, { active }),
    /** Switches between the remote server and the on-device server. */
    setConnectionMode: (mode: ConnectionMode): Promise<AuthState> =>
      invoke(CHANNELS.settings.setConnectionMode, { mode }),
  },
  localServer: {
    /** Installs the runtime when missing, then starts the on-device server. */
    setup: (): Promise<LocalServerStatus> => invoke(CHANNELS.localServer.setup, {}),
    /** Restarts the installed on-device server. */
    restart: (): Promise<LocalServerStatus> => invoke(CHANNELS.localServer.restart, {}),
    /** Cancels an install or start in progress. */
    cancel: (): Promise<LocalServerStatus> => invoke(CHANNELS.localServer.cancel, {}),
  },
  inference: {
    /** Saves key-protected engine settings and returns public settings. */
    update: (input: InferenceUpdate): Promise<PublicSettings> => invoke(CHANNELS.inference.update, input),
    /** Tests one engine on the running on-device server. */
    test: (target: 'speech' | 'llm'): Promise<InferenceTestResult> => invoke(CHANNELS.inference.test, { target }),
    /** Starts a model download on the running on-device server. */
    downloadModel: (model: string): Promise<LocalServerStatus> => invoke(CHANNELS.inference.downloadModel, { model }),
  },
  permissions: {
    /** Lists supported desktop capabilities and their permissions. */
    list: (): Promise<Capabilities> => invoke(CHANNELS.permissions.list, {}),
    /** Requests one capability from the operating system where possible. */
    request: (capability: CapabilityId): Promise<Capability> =>
      invoke(CHANNELS.permissions.request, { capability }),
    /** Re-probes consent that the OS cannot report passively, then lists capabilities. */
    check: (): Promise<Capabilities> => invoke(CHANNELS.permissions.check, {}),
    /** Opens the operating-system privacy page for one permission. */
    openSettings: (capability: 'microphone' | 'accessibility' | 'automation'): Promise<void> =>
      invoke(CHANNELS.permissions.openSettings, { capability }),
  },
  recording: {
    /** Starts an application recording. */
    start: (): Promise<RecordingState> => invoke(CHANNELS.recording.start, {}),
    /** Stops the active recording. */
    stop: (): Promise<RecordingState> => invoke(CHANNELS.recording.stop, {}),
    /** Cancels the active or processing recording. */
    cancel: (): Promise<RecordingState> => invoke(CHANNELS.recording.cancel, {}),
    /** Submits captured audio to the main-process transcription boundary. */
    submit: (input: RecordingSubmission): Promise<RecordingSubmissionResult> =>
      invoke(CHANNELS.recording.submit, input),
    /** Reports a local renderer capture lifecycle transition. */
    reportPhase: (report: RecordingPhaseReport): Promise<RecordingState> =>
      invoke(CHANNELS.recording.reportPhase, report),
    /** Relays transient hub-owned audio levels to the visual pill. */
    reportMeter: (meter: RecordingMeter): Promise<void> =>
      invoke(CHANNELS.recording.reportMeter, meter),
  },
  history: {
    /** Lists local transcription history. */
    list: (): Promise<HistoryEntry[]> => invoke(CHANNELS.history.list, {}),
    /** Deletes one local history item. */
    delete: (id: string): Promise<void> => invoke(CHANNELS.history.delete, { id }),
    /** Deletes all local history items. */
    clear: (): Promise<void> => invoke(CHANNELS.history.clear, {}),
    /** Copies one local history item's text using the native clipboard. */
    copy: (id: string): Promise<void> => invoke(CHANNELS.history.copy, { id }),
  },
  notes: {
    /** Lists local notes. */
    list: (): Promise<Note[]> => invoke(CHANNELS.notes.list, {}),
    /** Creates or updates a local note. */
    save: (input: NoteSaveInput): Promise<Note> => invoke(CHANNELS.notes.save, input),
    /** Deletes one local note. */
    delete: (id: string): Promise<void> => invoke(CHANNELS.notes.delete, { id }),
    /** Generates and stores a summary for one local note. */
    summarize: (id: string): Promise<Note> => invoke(CHANNELS.notes.summarize, { id }),
    /** Opens an existing note or an empty scratchpad. */
    open: (id?: string): Promise<void> => invoke(CHANNELS.notes.open, { id }),
  },
  dictionary: {
    /** Lists local dictionary entries. */
    list: (): Promise<DictionaryEntry[]> => invoke(CHANNELS.dictionary.list, {}),
    /** Creates or updates a local dictionary entry. */
    save: (input: DictionarySaveInput): Promise<DictionaryEntry> =>
      invoke(CHANNELS.dictionary.save, input),
    /** Deletes one local dictionary entry. */
    delete: (id: string): Promise<void> => invoke(CHANNELS.dictionary.delete, { id }),
  },
  snippets: {
    /** Lists local reusable snippets. */
    list: (): Promise<Snippet[]> => invoke(CHANNELS.snippets.list, {}),
    /** Creates or updates a local reusable snippet. */
    save: (input: SnippetSaveInput): Promise<Snippet> => invoke(CHANNELS.snippets.save, input),
    /** Deletes one local reusable snippet. */
    delete: (id: string): Promise<void> => invoke(CHANNELS.snippets.delete, { id }),
  },
  meetings: {
    /** Lists the scoped meeting cache, refreshing authoritatively when online. */
    list: (): Promise<Meeting[]> => invoke(CHANNELS.meetings.list, {}),
    /** Gets one scoped meeting without exposing its local audio path. */
    get: (id: string): Promise<Meeting | null> => invoke(CHANNELS.meetings.get, { id }),
    /** Saves an optimistic-concurrency transcript edit. */
    saveTranscript: (input: MeetingTextSaveInput): Promise<Meeting> =>
      invoke(CHANNELS.meetings.saveTranscript, input),
    /** Saves an optimistic-concurrency summary edit. */
    saveSummary: (input: MeetingTextSaveInput): Promise<Meeting> =>
      invoke(CHANNELS.meetings.saveSummary, input),
    /** Asks the backend about the complete saved meeting text. */
    ask: (input: MeetingQuestionInput): Promise<MeetingQuestionAnswer> =>
      invoke(CHANNELS.meetings.ask, input),
    /** Asks the API to regenerate a meeting summary. */
    regenerateSummary: (id: string): Promise<Meeting> =>
      invoke(CHANNELS.meetings.regenerateSummary, { id }),
    /** Starts a new local segment under an existing meeting identity. */
    resume: (id: string): Promise<MeetingCaptureState> => invoke(CHANNELS.meetings.resume, { id }),
    /** Retries durable authoritative work for one meeting. */
    retry: (id: string): Promise<Meeting> => invoke(CHANNELS.meetings.retry, { id }),
    /** Flushes the scoped durable meeting outbox and refreshes the cache. */
    sync: (): Promise<Meeting[]> => invoke(CHANNELS.meetings.sync, {}),
    /** Creates or updates local recording meeting metadata. */
    save: (input: MeetingSaveInput): Promise<Meeting> => invoke(CHANNELS.meetings.save, input),
    /** Deletes one local recording meeting record. */
    delete: (id: string): Promise<void> => invoke(CHANNELS.meetings.delete, { id }),
    capture: {
      /** Creates a local meeting and requests capture. */
      start: (input: { title: string }): Promise<MeetingCaptureState> =>
        invoke(CHANNELS.meetings.captureStart, input),
      /** Requests the active capture to stop. */
      stop: (): Promise<MeetingCaptureState | null> => invoke(CHANNELS.meetings.captureStop, {}),
      /** Discards the active capture. */
      cancel: (): Promise<void> => invoke(CHANNELS.meetings.captureCancel, {}),
      /** Appends one encoded audio chunk. */
      appendChunk: (input: { id: string; audio: Uint8Array }): Promise<void> =>
        invoke(CHANNELS.meetings.captureAppend, input),
      /** Completes the active capture. */
      finish: (input: { id: string; durationMs: number; contentType: string }): Promise<Meeting> =>
        invoke(CHANNELS.meetings.captureFinish, input),
      /** Reports a renderer capture failure. */
      fail: (input: { id: string; error: string }): Promise<void> =>
        invoke(CHANNELS.meetings.captureFail, input),
    },
    /** Imports a user-selected audio file as a local meeting. */
    importAudio: (): Promise<Meeting | null> => invoke(CHANNELS.meetings.importAudio, {}),
    /** Saves a meeting's local audio to a user-selected location. */
    exportAudio: (id: string): Promise<void> => invoke(CHANNELS.meetings.exportAudio, { id }),
  },
  metrics: {
    /** Gets authoritative account metrics. */
    get: (): Promise<Metrics> => invoke(CHANNELS.metrics.get, {}),
    /** Gets daily authoritative metric buckets for an inclusive date range. */
    daily: (range: { from: string; until: string }): Promise<DailyMetric[]> => invoke(CHANNELS.metrics.daily, range),
    /** Gets authoritative metric buckets by observed application label. */
    apps: (): Promise<AppMetric[]> => invoke(CHANNELS.metrics.apps, {}),
  },
  transformations: {
    /** Lists device-local transform definitions. */
    list: (): Promise<TransformDefinition[]> => invoke(CHANNELS.transformations.list, {}),
    /** Creates or updates one validated transform definition. */
    save: (input: TransformDefinitionSaveInput): Promise<TransformDefinition> => invoke(CHANNELS.transformations.save, input),
    /** Removes one custom transform definition. */
    delete: (id: string): Promise<void> => invoke(CHANNELS.transformations.delete, { id }),
    /** Restores local built-ins and removes customs. */
    reset: (): Promise<TransformDefinition[]> => invoke(CHANNELS.transformations.reset, {}),
    /** Captures selected native text before a review opens. */
    start: (definitionId?: string): Promise<TransformReview> => invoke(CHANNELS.transformations.start, { definitionId }),
    /** Generates a reviewed document-surface preview without native insertion. */
    preview: (input: TransformationInput): Promise<TransformationResult> => invoke(CHANNELS.transformations.preview, input),
    /** Reopens the latest pending review and notifies review subscribers. */
    view: (): Promise<TransformReview> => invoke(CHANNELS.transformations.view, {}),
    /** Generates a server proposal scoped to an opaque main-held session. */
    generate: (sessionId: string): Promise<TransformReview> => invoke(CHANNELS.transformations.generate, { sessionId }),
    /** Conditionally replaces only the unchanged original native selection. */
    accept: (sessionId: string): Promise<void> => invoke(CHANNELS.transformations.accept, { sessionId }),
    /** Discards one pending review. */
    reject: (sessionId: string): Promise<void> => invoke(CHANNELS.transformations.reject, { sessionId }),
    /** Applies the first transform in place from the pill. */
    runQuick: (): Promise<void> => invoke(CHANNELS.transformations.runQuick, {}),
  },
  account: {
    /** Saves supported server profile fields without disclosing credentials. */
    save: (input: AccountSaveInput) => invoke(CHANNELS.account.save, input),
    /** Performs the account deletion/sign-out operation. */
    delete: (): Promise<AuthState> => invoke(CHANNELS.account.delete, {}),
  },
  dataSync: {
    /** Merges on-device and signed-in remote data both ways. */
    run: (): Promise<DataSyncResult> => invoke(CHANNELS.dataSync.run, {}),
  },
  localData: {
    /** Permanently erases on-device server data and this app's on-device cache. */
    erase: (): Promise<void> => invoke(CHANNELS.localData.erase, {}),
  },
  window: {
    /** Minimizes the current window. */
    minimize: (): Promise<void> => invoke(CHANNELS.window.minimize, {}),
    /** Toggles maximization and returns the resulting state. */
    maximize: (): Promise<WindowState> => invoke(CHANNELS.window.maximize, {}),
    /** Closes the current window. */
    close: (): Promise<void> => invoke(CHANNELS.window.close, {}),
    /** Shows and focuses the app hub. */
    showHub: (): Promise<void> => invoke(CHANNELS.window.showHub, {}),
    /** Opens the scratchpad, optionally targeting one local note. */
    openScratchpad: (noteId?: string): Promise<void> =>
      invoke(CHANNELS.window.openScratchpad, { noteId }),
  },
  overlay: {
    /** Reports hover only for the owned overlay window. */
    setHovered: (hovered: boolean): Promise<void> => invoke(CHANNELS.overlay.setHovered, { hovered }),
    /** Requests one bounded drag gesture operation on the owned pill. */
    drag: (command: 'begin' | 'move' | 'end' | 'cancel'): Promise<void> =>
      invoke(CHANNELS.overlay.drag, { command }),
    /** Starts Notetaker from the pill's hover action. */
    startNotetaker: (): Promise<void> => invoke(CHANNELS.overlay.startNotetaker, {}),
  },
  transformPopup: {
    /** Grows or shrinks the result pop-up above the pill. */
    setExpanded: (expanded: boolean): Promise<void> => invoke(CHANNELS.transformPopup.setExpanded, { expanded }),
    /** Keeps the result pop-up open while the pointer is over it. */
    setPinned: (pinned: boolean): Promise<void> => invoke(CHANNELS.transformPopup.setPinned, { pinned }),
    /** Closes the result pop-up. */
    dismiss: (): Promise<void> => invoke(CHANNELS.transformPopup.dismiss, {}),
  },
  clipboard: {
    /** Copies plain text through the main-process clipboard boundary. */
    copy: (text: string): Promise<void> => invoke(CHANNELS.clipboard.copy, { text }),
  },
  diagnostics: {
    /** Exports redacted diagnostics using a user-selected local destination. */
    export: (): Promise<DiagnosticsExport> => invoke(CHANNELS.diagnostics.export, {}),
    /** Opens the platform diagnostics location. */
    open: (): Promise<void> => invoke(CHANNELS.diagnostics.open, {}),
  },
  updates: {
    /** Checks the public release feed now. */
    check: (): Promise<UpdateStatus> => invoke(CHANNELS.updates.check, {}),
    /** Opens the installer download or release notes that main already holds. */
    open: (target: 'download' | 'release'): Promise<void> => invoke(CHANNELS.updates.open, { target }),
  },
  events: {
    /** Subscribes to renderer-safe application state. */
    onState: (listener: (state: BootstrapState) => void): Unsubscribe =>
      subscribe(CHANNELS.events.state, listener),
    /** Subscribes to shortcut actions that require renderer review or navigation. */
    onShortcutAction: (listener: (action: 'transform' | 'transformView' | 'startMeeting') => void): Unsubscribe =>
      subscribe(CHANNELS.events.shortcutAction, listener),
    /** Subscribes to native recording commands. */
    onRecordingCommand: (listener: (command: RecordingCommand) => void): Unsubscribe =>
      subscribe(CHANNELS.events.recordingCommand, listener),
    /** Subscribes to transient RMS envelope measurements. */
    onRecordingMeter: (listener: (meter: RecordingMeter) => void): Unsubscribe =>
      subscribe(CHANNELS.events.recordingMeter, listener),
    /** Subscribes to local history changes. */
    onHistoryChanged: (listener: () => void): Unsubscribe =>
      subscribe(CHANNELS.events.historyChanged, listener),
    /** Subscribes to local notes changes. */
    onNotesChanged: (listener: () => void): Unsubscribe =>
      subscribe(CHANNELS.events.notesChanged, listener),
    /** Subscribes to meeting capture commands. */
    onMeetingCaptureCommand: (listener: (command: MeetingCaptureCommand) => void): Unsubscribe =>
      subscribe(CHANNELS.events.meetingCaptureCommand, listener),
    /** Subscribes to local meeting list changes. */
    onMeetingsChanged: (listener: () => void): Unsubscribe =>
      subscribe(CHANNELS.events.meetingsChanged, listener),
    /** Subscribes to safe review details without the native target identity. */
    onTransformReview: (listener: (review: TransformReview) => void): Unsubscribe =>
      subscribe(CHANNELS.events.transformReview, listener),
    /** Subscribes to on-device server, installer and model progress. */
    onLocalServerChanged: (listener: (status: LocalServerStatus) => void): Unsubscribe =>
      subscribe(CHANNELS.events.localServerChanged, listener),
  },
}

contextBridge.exposeInMainWorld('whisperer', desktopApi)
