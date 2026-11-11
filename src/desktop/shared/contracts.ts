/**
 * Public, process-neutral types for the desktop IPC boundary.
 *
 * This module intentionally has no Electron or Node imports so both the main
 * process and sandboxed renderer can use the same contract.
 */

/** Describes the appearance mode selected by the user. */
export type { ShortcutBindings, ShortcutAction } from './shortcuts'
import type { ShortcutBindings } from './shortcuts'

export type Theme = 'light' | 'dark' | 'system'

/** A local, user-configured prompt applied to selected text. */
export interface TransformDefinition {
  /** Stable local identifier. Built-ins keep predictable identifiers. */
  id: string
  /** User-visible title for this transform. */
  name: string
  /** Instruction passed to the existing server transformation endpoint. */
  prompt: string
  /** Native shortcut which starts a selection-backed review, or empty when unset. */
  shortcut: string
  /** Whether this definition is one of the resettable built-ins. */
  builtIn: boolean
}

/** Controls optional transform automation after dictation without bypassing review. */
export interface AutoAfterDictationTransform {
  /** Whether a dictation proposal should be generated after completion. */
  active: boolean
  /** The selected definition, retained even while inactive. */
  definitionId: string | null
}

/** Renderer-safe description of a main-held text selection review session. */
export interface TransformReview {
  /** Opaque session identity, valid only until rejected, accepted, or replaced. */
  sessionId: string
  /** Immutable selection text captured before the hub received focus. */
  sourceText: string
  /** Definition chosen by the native shortcut or review UI. */
  definition: TransformDefinition
  /** Generated server proposal, if generation has completed. */
  proposal: string | null
  /** Whether this review still has a secure native target for conditional replacement. */
  canApply: boolean
}

/** Describes the lifecycle state of a desktop recording. */
export type RecordingStatus =
  'idle' | 'starting' | 'recording' | 'stopping' | 'processing' | 'error'

/** Describes a command issued by the main process to recording UI. */
export type RecordingCommand = 'start' | 'stop' | 'cancel'

/** Describes the stage reached while locally capturing or submitting audio. */
export type RecordingCapturePhase =
  'idle' | 'capturing' | 'captured' | 'submitting' | 'submitted' | 'cancelled' | 'failed'

/** Describes whether a persisted history item is still being processed. */
export type HistoryStatus = 'processing' | 'completed' | 'failed'

/** Describes the desktop's local synchronization status for a note. */
export type NoteSyncState = 'local' | 'pending' | 'synced' | 'error'

/** Identifies a desktop capability that can be checked or requested. */
export type CapabilityId =
  'microphone' | 'accessibility' | 'automation' | 'globalShortcut' | 'autoPaste' | 'holdToTalk' | 'systemAudio'

/** Reports whether a capability exists and is usable on the current platform. */
export interface Capability {
  /** Whether this capability is implemented on the current operating system. */
  supported: boolean
  /** Whether the user or operating system has granted access. */
  granted: boolean
  /** Explains why the capability is unavailable or denied, when applicable. */
  reason: string | null
}

/** Lists all capabilities exposed to the renderer. */
export type Capabilities = Record<CapabilityId, Capability>

/** Selects the one backend the desktop talks to: a remote server or the owned on-device server. */
export type ConnectionMode = 'remote' | 'device'

/** Speech models the on-device server can download and run. The server rejects any other id. */
export const ON_DEVICE_SPEECH_MODELS = [
  { id: 'istupakov/parakeet-tdt-0.6b-v3-onnx', label: 'Parakeet TDT 0.6B v3', languages: '25 European languages', sizeBytes: 670_000_000 },
  { id: 'istupakov/whisper-base-onnx', label: 'Whisper base', languages: 'Multilingual', sizeBytes: 108_000_000 },
] as const

/** Public speech configuration; an API key is reported only as present or absent. */
export type SpeechSettings =
  | { provider: 'onnx'; model: string }
  | { provider: 'http'; baseUrl: string; model: string; hasApiKey: boolean }

/** Public language-model configuration; an API key is reported only as present or absent. */
export type LlmSettings =
  | { provider: 'off' }
  | { provider: 'http'; baseUrl: string; model: string; hasApiKey: boolean }

/** Key-free inference configuration used by the on-device server. */
export interface InferenceSettings {
  speech: SpeechSettings
  llm: LlmSettings
}

/** Speech update. `apiKey` omitted keeps the saved key, an empty string removes it. */
export type SpeechSettingsInput =
  | { provider: 'onnx'; model: string }
  | { provider: 'http'; baseUrl: string; model: string; apiKey?: string }

/** Language-model update. `apiKey` omitted keeps the saved key, an empty string removes it. */
export type LlmSettingsInput =
  | { provider: 'off' }
  | { provider: 'http'; baseUrl: string; model: string; apiKey?: string }

/** Renderer request changing one or both inference engines. */
export interface InferenceUpdate {
  speech?: SpeechSettingsInput
  llm?: LlmSettingsInput
}

/** Lifecycle of the owned on-device server and its runtime. */
export type LocalServerState = 'notInstalled' | 'installing' | 'stopped' | 'starting' | 'ready' | 'stopping' | 'failed'

/** Step currently running or last failed, or null when idle or ready. */
export type LocalServerStage = 'uv' | 'python' | 'packages' | 'launch' | 'database' | 'verify' | null

/** Reported byte progress without invented percentages. */
export interface ByteProgress {
  completedBytes: number
  totalBytes: number | null
}

/** Readiness of the selected speech engine on the on-device server. */
export type SpeechStatus = 'unknown' | 'unconfigured' | 'missing' | 'downloading' | 'verifying' | 'loading' | 'ready' | 'failed'

/** Readiness of the selected language model on the on-device server. */
export type LlmStatus = 'unknown' | 'unconfigured' | 'off' | 'ready' | 'failed'

/** Renderer-safe status of the on-device server, its installer and its engines. */
export interface LocalServerStatus {
  state: LocalServerState
  stage: LocalServerStage
  /** One-line user-facing explanation, or null. */
  message: string | null
  /** Current download progress, or null. */
  progress: ByteProgress | null
  /** Verified loopback port, or null. */
  port: number | null
  /** Sanitized activity log, oldest first. */
  log: string[]
  /** Whether Retry or Restart is meaningful now. */
  canRetry: boolean
  speech: { status: SpeechStatus; model: string | null; message: string | null; progress: ByteProgress | null }
  llm: { status: LlmStatus; model: string | null; message: string | null }
}

/** Result of an explicit engine test on the on-device server. */
export interface InferenceTestResult {
  ok: boolean
  latencyMs: number | null
  message: string
}

/** Contains only preferences that are safe to expose to renderer code. */
export interface PublicSettings {
  /** Selected backend. Absent in fixtures from older builds; main always sends it. */
  connectionMode?: ConnectionMode
  /** On-device server status. Main always sends it. */
  localServer?: LocalServerStatus
  /** Key-free inference configuration. Main always sends it. */
  inference?: InferenceSettings
  /** Whether the on-device runtime is installed, so a switch to this device needs no download. Main always sends it. */
  runtimeInstalled?: boolean
  /** The signed-in API host, or null before sign-in and after sign-out. */
  apiHost: string | null
  /** Whether an authenticated desktop session is currently available. */
  authenticated: boolean
  /** Whether credentials exist in encrypted main-process storage. */
  secureCredentials: boolean
  /** The language used for dictation and transcription. */
  language: string
  /** Whether returned transcripts should be polished before use. */
  polish: boolean
  /** Whether completed dictation should be pasted into the active application. */
  autoPaste: boolean
  /** The registered global keyboard shortcut, or an empty string when disabled. */
  shortcut: string
  /** The selected microphone device identifier, or null for the system default. */
  microphoneId: string | null
  /** Whether the device onboarding sequence has been completed. */
  onboardingCompleted: boolean
  /** Whether the application opens at operating-system login. */
  launchAtLogin: boolean
  /** The requested light, dark, or operating-system appearance mode. */
  theme: Theme
  /** Whether locally captured audio is retained after submission. */
  retainAudio: boolean
  /** Whether the shortcut records only while held. */
  holdToTalk: boolean
  /** Whether the floating status bar is visible while signed in. */
  showStatusBar: boolean
  /** Whether on-device and signed-in remote data sync each time the on-device server starts. Main always sends it. */
  syncAtStartup?: boolean
  /** Whether the status bar includes a scratchpad button. */
  scratchpadInBar: boolean
  /** Shortcut opening a new scratchpad note, or empty to disable it. */
  scratchpadShortcut: string
  /** Independent action bindings; empty arrays disable optional actions. */
  shortcutBindings: ShortcutBindings
  /** Whether transform shortcuts may be registered on this device. */
  transformsEnabled: boolean
  /** Preset used for optional post-dictation proposals. */
  autoAfterDictationTransform: AutoAfterDictationTransform
}

/** Contains renderer-editable preferences, excluding main-process security state. */
export type PublicSettingsUpdate = Partial<
  Pick<
    PublicSettings,
    | 'language'
    | 'polish'
    | 'autoPaste'
    | 'shortcut'
    | 'microphoneId'
    | 'onboardingCompleted'
    | 'launchAtLogin'
    | 'theme'
    | 'retainAudio'
    | 'holdToTalk'
    | 'showStatusBar'
    | 'syncAtStartup'
    | 'scratchpadInBar'
    | 'scratchpadShortcut'
    | 'shortcutBindings'
    | 'transformsEnabled'
    | 'autoAfterDictationTransform'
  >
>

/** Represents the signed-in person without credential or token material. */
export interface User {
  /** Stable user identifier supplied by the authenticated service. */
  id: string
  /** User email address for account display, when the service supplies one. */
  email: string | null
  /** Friendly account name for display in the application. */
  displayName: string
}

/** Summarizes active recording state for app startup and state events. */
export interface RecordingState {
  /** Current recording lifecycle status. */
  status: RecordingStatus
  /** Capture interaction mode; absent older snapshots display handsfree controls. */
  mode?: 'handsfree' | 'push-to-talk'
  /** Current local capture or upload phase. */
  capturePhase: RecordingCapturePhase
  /** Start time as an ISO-8601 instant, or null while idle. */
  startedAt: string | null
  /** Human-readable failure detail, or null without an error. */
  error: string | null
}

/** Ephemeral microphone measurement; never written to account data or bootstrap storage. */
export interface RecordingMeter {
  /** Smoothed RMS amplitude, normalized to the inclusive 0–1 range. */
  level: number
  /** Elapsed capture time in milliseconds. */
  elapsedMs: number
  /** Identifies which mutually exclusive hub capture owns this measurement. */
  source?: 'dictation' | 'meeting'
}

/** Supplies renderer-safe state required to initialize the application. */
export interface BootstrapState {
  /** Renderer-safe user preferences and session indicators. */
  settings: PublicSettings
  /** The current user, or null when signed out. */
  user: User | null
  /** Per-platform capability status. */
  capabilities: Capabilities
  /** Application version for diagnostics and update UI. */
  version: string
  /** Host operating system, used only to place native window controls. */
  platform: DesktopPlatform
  /** Current recording lifecycle state. */
  recording: RecordingState
  /** Active local meeting capture, or null. */
  meetingCapture: MeetingCaptureState | null
  /** Shortcut transform shown on the pill, or null when none is running. */
  transform: TransformActivity | null
  /** First transform in the list, offered as a button on the pill; null when transforms are off or empty. */
  quickTransform: { id: string; name: string } | null
  /** Screen edge the pill is docked to; left and right turn the bar vertical. */
  overlayDockEdge: 'bottom' | 'left' | 'right'
  /** Result of the latest check of the public release feed. */
  updates: UpdateStatus
}

/** A newer release with an installer for this platform and architecture. */
export interface UpdateInfo {
  /** Semantic version of the release. */
  version: string
  /** Release title. */
  name: string
  /** Whether the release is marked as a prerelease. */
  prerelease: boolean
  /** Publication instant, or null when the feed gave none. */
  publishedAt: string | null
  /** Release notes page. */
  pageUrl: string
  /** Installer download. */
  downloadUrl: string
  /** Installer file name. */
  assetName: string
  /** Installer size in bytes. */
  bytes: number
}

/** What the desktop knows about newer releases. It notifies and links; it never installs on its own. */
export interface UpdateStatus {
  /** Version of the running build. */
  currentVersion: string
  /** A check is in flight. */
  checking: boolean
  /** Completion of the last successful check, or null before one. */
  checkedAt: string | null
  /** The newer release on offer, or null when this build is the newest known. */
  update: UpdateInfo | null
  /** Why the last check failed, or null when it succeeded. */
  error: string | null
}

/** A shortcut transform the pill is showing: running, or finished with a pop-up result. */
export type TransformActivity =
  | { phase: 'applying'; name: string }
  | { phase: 'applied'; name: string; sourceText: string; proposal: string; expanded?: boolean }
  | { phase: 'failed'; name: string; message: string }

/** Identifies the desktop operating system family. */
export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

/** Outcome of one two-way data sync. */
export interface DataSyncResult {
  /** Records added, replaced or removed across both sides. */
  changes: number
}

/** Supplies renderer-safe state after an authentication operation. */
export interface AuthState {
  /** The public settings after authentication state changes. */
  settings: PublicSettings
  /** The signed-in user, or null when an authentication action was cancelled. */
  user: User | null
}

/** Describes a completed or in-progress transcription saved locally. */
export interface HistoryEntry {
  /** Stable local entry identifier. */
  id: string
  /** Display text, potentially polished according to user settings. */
  text: string
  /** Unpolished transcript returned by the transcription operation. */
  rawText: string
  /** Creation time as an ISO-8601 instant. */
  createdAt: string
  /** Captured audio duration in milliseconds. */
  durationMs: number
  /** Language used for transcription. */
  language: string
  /** Target application name when known, otherwise null. */
  appName: string | null
  /** Whether the result was pasted into the target application. */
  pasted: boolean
  /** Local transcription lifecycle status. */
  status: HistoryStatus
  /** Number of dictionary substitutions applied once by the authoritative transcription service. */
  dictionaryReplacements?: number
}

/** Defines audio bytes and metadata accepted by transcription submission. */
export interface RecordingSubmission {
  /** Captured audio bytes owned by the renderer until this request completes. */
  audio: Uint8Array
  /** Captured audio duration in milliseconds. */
  durationMs: number
  /** IANA media type for the audio payload. */
  contentType: string
  /** Safe local filename used to identify the submitted capture. */
  filename: string
}

/** Returns the saved entry and the terminal capture phase after submission. */
export interface RecordingSubmissionResult {
  /** Persisted history record for the submitted audio. */
  historyEntry: HistoryEntry
  /** Capture phase reached by the submitted recording. */
  capturePhase: Extract<RecordingCapturePhase, 'submitted' | 'failed'>
}

/** Lets a renderer report a local capture phase transition to the main process. */
export interface RecordingPhaseReport {
  /** Capture phase observed by the renderer. */
  capturePhase: RecordingCapturePhase
  /** Optional human-readable detail for a failed phase. */
  error?: string
}

/** Represents a locally stored note. */
export interface Note {
  /** Stable local note identifier. */
  id: string
  /** User-facing title. */
  title: string
  /** Note body text. */
  content: string
  /** Generated summary, or null when no summary has been requested. */
  summary: string | null
  /** Last update time as an ISO-8601 instant. */
  updatedAt: string
  /** Whether the note is pinned in local UI. */
  pinned: boolean
  /** Whether this note is intentionally retained only on the device. */
  localOnly: boolean
  /** Current local synchronization state. */
  syncState: NoteSyncState
}

/** Supplies fields used to create or update a note. */
export interface NoteSaveInput {
  /** Existing note identifier; omit it to create a note. */
  id?: string
  /** User-facing title. */
  title: string
  /** Note body text. */
  content: string
  /** Whether the note should be pinned. */
  pinned?: boolean
  /** Whether the note must remain device-local. */
  localOnly?: boolean
}

/** Represents a replacement used during transcript cleanup. */
export interface DictionaryEntry {
  /** Stable local dictionary entry identifier. */
  id: string
  /** Heard phrase to recognize. */
  phrase: string
  /** Replacement text to use for the phrase. */
  replacement: string
}

/** Supplies fields used to create or update a dictionary replacement. */
export interface DictionarySaveInput {
  /** Existing dictionary identifier; omit it to create an entry. */
  id?: string
  /** Heard phrase to recognize. */
  phrase: string
  /** Replacement text to use for the phrase. */
  replacement: string
}

/** Represents reusable expansion text triggered by a shortcut. */
export interface Snippet {
  /** Stable local snippet identifier. */
  id: string
  /** Trigger shortcut typed or selected by the user. */
  shortcut: string
  /** Expanded text. */
  text: string
  /** Number of times the snippet has been used. */
  useCount: number
}

/** Supplies fields used to create or update a snippet. */
export interface SnippetSaveInput {
  /** Existing snippet identifier; omit it to create a snippet. */
  id?: string
  /** Trigger shortcut typed or selected by the user. */
  shortcut: string
  /** Expanded text. */
  text: string
}

/** Represents locally stored metadata for a desktop recording meeting. */
export type MeetingProcessingStatus = 'pending' | 'running' | 'complete' | 'failed' | 'idle'

/** Describes whether the local meeting cache has reached the authoritative API. */
export type MeetingSyncState = 'local' | 'pending' | 'synced' | 'error'

/** Represents local and authoritative state for a recorded meeting. */
export interface Meeting {
  /** Stable client-generated meeting identifier. */
  id: string
  /** User-visible meeting title. */
  title: string
  /** Meeting start time as an ISO-8601 instant. */
  startedAt: string
  /** Meeting end time as an ISO-8601 instant, or null while in progress. */
  endedAt: string | null
  /** Recorded duration in milliseconds. */
  durationMs: number
  /** Related local history entry identifiers. */
  historyEntryIds: string[]
  /** Whether locally retained or remotely available microphone audio exists. */
  hasAudio: boolean
  /** The authoritative transcript, when it has been created or cached. */
  transcript?: string
  /** Optimistic-concurrency revision of the transcript. */
  transcriptRevision?: number
  /** The authoritative generated or user-edited summary, when available. */
  summary?: string
  /** Optimistic-concurrency revision of the summary. */
  summaryRevision?: number
  /** Transcript revision the summary was generated from. */
  summarySourceRevision?: number | null
  /** Whether a transcript edit makes the available summary outdated. */
  summaryStale?: boolean
  /** Optimistic-concurrency revision of the meeting metadata. */
  revision?: number
  /** Current transcript processing lifecycle. */
  transcriptStatus?: MeetingProcessingStatus
  /** Current summary processing lifecycle. */
  summaryStatus?: MeetingProcessingStatus
  /** Desktop delivery state for the scoped authoritative cache. */
  syncState?: MeetingSyncState
  /** Safe error detail from the last attempted synchronization. */
  error?: string | null
}

/** A revisioned user edit to an authoritative meeting text field. */
export interface MeetingTextSaveInput {
  /** Existing authoritative meeting identifier. */
  id: string
  /** Complete replacement text. */
  text: string
  /** Revision being edited, used to reject lost updates. */
  revision: number
}

/** Requests an ephemeral answer from one meeting's saved backend-owned snapshot. */
export interface MeetingQuestionInput {
  /** Existing authoritative meeting identifier. */
  id: string
  /** Single user-authored question; it never contains transcript context. */
  question: string
  /** Optional expected saved transcript revision. */
  transcriptRevision?: number
  /** Optional expected saved summary revision. */
  summaryRevision?: number
}

/** Returns an ephemeral answer and the authoritative revision snapshot it used. */
export interface MeetingQuestionAnswer {
  /** Answer returned by the configured backend language model. */
  answer: string
  /** Saved transcript revision used for this answer. */
  transcriptRevision: number
  /** Saved summary revision used for this answer. */
  summaryRevision: number
  /** Whether the saved summary was older than the saved transcript. */
  summaryStale: boolean
  /** Whether a saved summary was available alongside the transcript. */
  usedSummary: boolean
}

/** Aggregated authoritative dictation metrics for the signed-in account. */
export interface Metrics {
  totalWords: number
  totalDurationMs: number
  dictationCount: number
  dictionaryReplacements: number
  /** Raw transcript words changed before output across the account. */
  correctedWords: number
  wordsPerMinute: number
  wordsToday: number
  wordsThisWeek: number
  wordsThisMonth: number
  wordsLastMonth: number
  /** Calendar days with at least one dictation. */
  activeDays: number
  dayStreak: number
  longestDayStreak: number
  weekStreak: number
  timeZone: string
}

/** One date bucket returned by authoritative metrics. */
export interface DailyMetric {
  date: string
  words: number
  durationMs: number
  dictationCount: number
  dictionaryReplacements: number
  correctedWords: number
}

/** One frontmost-application bucket returned by authoritative metrics. */
export interface AppMetric {
  appName: string
  words: number
  durationMs: number
  dictationCount: number
}

/** Fields used to create or update a local transform definition. */
export interface TransformDefinitionSaveInput {
  /** Existing transform identifier; omit it to create a custom definition. */
  id?: string
  /** Human-readable transform name. */
  name: string
  /** Instruction sent to the text transformation backend. */
  prompt: string
  /** Native accelerator, or an empty string to leave this transform unbound. */
  shortcut: string
}

/** Enumerates explicit server-backed text transformations. */
export type TransformationKind = 'polish' | 'shorten' | 'expand' | 'tone' | 'translate' | 'custom'

/** Defines one explicit server-backed text transformation request. */
export interface TransformationInput {
  text: string
  kind: TransformationKind
  instruction?: string
  targetLanguage?: string
}

/** Returns transformed text without copying or pasting it. */
export interface TransformationResult {
  id: string
  text: string
}

/** Supplies optional account profile fields supported by a connected API. */
export interface AccountSaveInput {
  /** Legacy friendly display name accepted when the server exposes only a combined label. */
  displayName?: string
  /** Server-supported given-name field. */
  firstName?: string | null
  /** Server-supported family-name field. */
  lastName?: string | null
}

/** Describes an in-progress local meeting microphone capture. */
export interface MeetingCaptureState {
  /** Local meeting identifier receiving audio. */
  id: string
  /** User-visible meeting title. */
  title: string
  /** Capture lifecycle status. */
  status: 'starting' | 'recording' | 'stopping' | 'error'
  /** Capture start as an ISO-8601 instant. */
  startedAt: string
  /** Safe error text, or null. */
  error: string | null
}

/** Commands main sends to the single meeting capture owner. */
export interface MeetingCaptureCommand {
  /** Requested lifecycle transition. */
  command: 'start' | 'stop' | 'cancel'
  /** Meeting identifier the command applies to. */
  id: string
  /** Meeting title for display. */
  title: string
}

/** Supplies fields used to create or update local meeting metadata. */
export interface MeetingSaveInput {
  /** Existing meeting identifier; omit it to create a meeting record. */
  id?: string
  /** User-visible meeting title. */
  title: string
  /** Meeting start time as an ISO-8601 instant. */
  startedAt: string
  /** Meeting end time as an ISO-8601 instant, or null while in progress. */
  endedAt?: string | null
  /** Recorded duration in milliseconds. */
  durationMs: number
  /** Related local history entry identifiers. */
  historyEntryIds?: string[]
}

/** Describes the location written by a diagnostics export operation. */
export interface DiagnosticsExport {
  /** Absolute platform path selected by the user, or null when cancelled. */
  path: string | null
}

/** Describes the maximized state returned by a window operation. */
export interface WindowState {
  /** Whether the target window is currently maximized. */
  maximized: boolean
}

/** Represents a successful typed IPC response. */
export interface IpcSuccess<T> {
  /** Discriminator indicating that the operation completed. */
  ok: true
  /** Typed operation data. */
  data: T
}

/** Represents a safe, renderer-displayable IPC error response. */
export interface IpcFailure {
  /** Discriminator indicating that the operation failed. */
  ok: false
  /** Stable error code for renderer branching. */
  error: {
    /** Machine-readable error code. */
    code: string
    /** Safe human-readable error message. */
    message: string
  }
}

/** Represents either successful data or a safe IPC error. */
export type IpcResult<T> = IpcSuccess<T> | IpcFailure

/** Removes a renderer event subscription. */
export type Unsubscribe = () => void

/** Exposes only named, validated operations to sandboxed renderer code. */
export interface DesktopApi {
  /** Loads the renderer-safe application state required at startup. */
  bootstrap(): Promise<BootstrapState>
  /** Manages device-code authentication without exposing credentials. */
  auth: {
    /** Begins sign-in against the supplied API host. */
    signIn(apiHost: string): Promise<AuthState>
    /** Cancels a pending sign-in operation. */
    cancel(): Promise<AuthState>
    /** Deletes the local encrypted session and returns signed-out state. */
    signOut(): Promise<AuthState>
  }
  /** Updates renderer-editable preferences. */
  settings: {
    /** Persists the supplied preference subset and returns all public settings. */
    update(partial: PublicSettingsUpdate): Promise<PublicSettings>
    /** Suspends native shortcuts while this window captures or tests a chord. */
    setShortcutCapture(active: boolean): Promise<void>
    /** Switches the one active backend; refused while dictation, a meeting or a transform is in flight. */
    setConnectionMode(mode: ConnectionMode): Promise<AuthState>
  }
  /** Installs and supervises the on-device server. Nothing downloads without an explicit setup call. */
  localServer: {
    /** Downloads and verifies the runtime if missing, then starts the server. */
    setup(): Promise<LocalServerStatus>
    /** Restarts the installed server and resets its automatic restart budget. */
    restart(): Promise<LocalServerStatus>
    /** Cancels an install or start in progress. */
    cancel(): Promise<LocalServerStatus>
  }
  /** Configures and checks the on-device server's speech and language-model engines. */
  inference: {
    /** Saves engine settings; keys go to OS-encrypted storage and are never returned. */
    update(input: InferenceUpdate): Promise<PublicSettings>
    /** Tests one engine through the running on-device server. */
    test(target: 'speech' | 'llm'): Promise<InferenceTestResult>
    /** Starts a model download on the running on-device server. */
    downloadModel(model: string): Promise<LocalServerStatus>
  }
  /** Lists and requests operating-system permissions. */
  permissions: {
    /** Lists all known desktop capability states. */
    list(): Promise<Capabilities>
    /** Requests a single capability where the operating system permits it. */
    request(capability: CapabilityId): Promise<Capability>
    /** Re-probes consent that the OS cannot report passively, then lists capabilities. */
    check(): Promise<Capabilities>
    /** Opens the operating-system privacy page for one permission. */
    openSettings(capability: 'microphone' | 'accessibility' | 'automation'): Promise<void>
  }
  /** Coordinates recording lifecycle requests and renderer capture reports. */
  recording: {
    /** Begins a user-initiated recording. */
    start(): Promise<RecordingState>
    /** Stops an active recording and enters processing. */
    stop(): Promise<RecordingState>
    /** Cancels an active or processing recording. */
    cancel(): Promise<RecordingState>
    /** Submits captured audio to the main process for safe processing. */
    submit(input: RecordingSubmission): Promise<RecordingSubmissionResult>
    /** Reports a renderer-side capture phase transition. */
    reportPhase(report: RecordingPhaseReport): Promise<RecordingState>
    /** Relays a hub-owned microphone measurement without persisting or rebuilding bootstrap state. */
    reportMeter(meter: RecordingMeter): Promise<void>
  }
  /** Manages local transcription history. */
  history: {
    /** Lists locally persisted transcription entries. */
    list(): Promise<HistoryEntry[]>
    /** Deletes one local transcription entry. */
    delete(id: string): Promise<void>
    /** Deletes all local transcription entries. */
    clear(): Promise<void>
    /** Copies an entry's display text to the operating-system clipboard. */
    copy(id: string): Promise<void>
  }
  /** Manages device-local notes and the scratchpad window. */
  notes: {
    /** Lists local notes ordered by their latest update. */
    list(): Promise<Note[]>
    /** Creates or updates a local note. */
    save(input: NoteSaveInput): Promise<Note>
    /** Deletes a local note. */
    delete(id: string): Promise<void>
    /** Generates and stores a summary for one local note. */
    summarize(id: string): Promise<Note>
    /** Opens an existing note, or an empty scratchpad when omitted. */
    open(id?: string): Promise<void>
  }
  /** Manages transcript replacement rules. */
  dictionary: {
    /** Lists all local dictionary replacements. */
    list(): Promise<DictionaryEntry[]>
    /** Creates or updates a local dictionary replacement. */
    save(input: DictionarySaveInput): Promise<DictionaryEntry>
    /** Deletes a local dictionary replacement. */
    delete(id: string): Promise<void>
  }
  /** Manages local reusable text snippets. */
  snippets: {
    /** Lists all local text snippets. */
    list(): Promise<Snippet[]>
    /** Creates or updates a local text snippet. */
    save(input: SnippetSaveInput): Promise<Snippet>
    /** Deletes a local text snippet. */
    delete(id: string): Promise<void>
  }
  /** Manages locally cached, authoritative meeting records. */
  meetings: {
    /** Lists scoped local meeting records, refreshing from the API where possible. */
    list(): Promise<Meeting[]>
    /** Retrieves one scoped meeting or null when it is not locally cached. */
    get(id: string): Promise<Meeting | null>
    /** Creates or updates meeting metadata. */
    save(input: MeetingSaveInput): Promise<Meeting>
    /** Saves a revisioned transcript edit. */
    saveTranscript(input: MeetingTextSaveInput): Promise<Meeting>
    /** Saves a revisioned summary edit. */
    saveSummary(input: MeetingTextSaveInput): Promise<Meeting>
    /** Requests an ephemeral answer from the server-owned saved meeting text. */
    ask(input: MeetingQuestionInput): Promise<MeetingQuestionAnswer>
    /** Requests authoritative summary regeneration. */
    regenerateSummary(id: string): Promise<Meeting>
    /** Resumes capture against the existing meeting identifier. */
    resume(id: string): Promise<MeetingCaptureState>
    /** Retries pending authoritative processing for a meeting. */
    retry(id: string): Promise<Meeting>
    /** Synchronizes scoped local cache and pending delivery work. */
    sync(): Promise<Meeting[]>
    /** Deletes one device-local meeting record. */
    delete(id: string): Promise<void>
    /** Controls local microphone meeting capture. */
    capture: {
      /** Creates a local meeting and asks the capture owner to start. */
      start(input: { title: string }): Promise<MeetingCaptureState>
      /** Asks the capture owner to stop and finish the file. */
      stop(): Promise<MeetingCaptureState | null>
      /** Discards the active capture and its partial audio. */
      cancel(): Promise<void>
      /** Appends one encoded audio chunk from the capture owner. */
      appendChunk(input: { id: string; audio: Uint8Array }): Promise<void>
      /** Completes the active capture with its measured duration. */
      finish(input: { id: string; durationMs: number; contentType: string }): Promise<Meeting>
      /** Reports a renderer-side capture failure and releases the capture. */
      fail(input: { id: string; error: string }): Promise<void>
    }
    /** Imports a user-selected local audio file as a meeting. Returns null when cancelled. */
    importAudio(): Promise<Meeting | null>
    /** Saves a meeting's local audio file to a user-selected location. */
    exportAudio(id: string): Promise<void>
  }
  /** Reads authoritative aggregate metrics without exposing network access. */
  metrics: {
    get(): Promise<Metrics>
    /** Lists daily buckets for an inclusive YYYY-MM-DD range of at most a year. */
    daily(range: { from: string; until: string }): Promise<DailyMetric[]>
    apps(): Promise<AppMetric[]>
  }
  /** Manages local definitions and selection-backed review sessions. */
  transformations: {
    /** Lists local transform definitions in display order. */
    list(): Promise<TransformDefinition[]>
    /** Creates or updates one definition after local validation. */
    save(input: TransformDefinitionSaveInput): Promise<TransformDefinition>
    /** Removes a custom definition. Built-ins are restored through reset instead. */
    delete(id: string): Promise<void>
    /** Restores built-ins and removes custom definitions. */
    reset(): Promise<TransformDefinition[]>
    /** Captures the current native selection before the hub takes focus. */
    start(definitionId?: string): Promise<TransformReview>
    /** Generates an explicit non-native text preview for a document surface. */
    preview(input: TransformationInput): Promise<TransformationResult>
    /** Reopens the latest still-pending review session. */
    view(): Promise<TransformReview>
    /** Requests a proposal for a main-held captured selection. */
    generate(sessionId: string): Promise<TransformReview>
    /** Applies only the main-held proposal if the native selection is still unchanged. */
    accept(sessionId: string): Promise<void>
    /** Discards a main-held selection review session. */
    reject(sessionId: string): Promise<void>
    /** Applies the first transform in place, as its shortcut would; only the pill may call this. */
    runQuick(): Promise<void>
  }
  /** Performs account actions without credential material. */
  account: {
    /** Saves supported profile fields when the connected API provides them. */
    save(input: AccountSaveInput): Promise<User>
    /** Deletes the account server-side where supported and always signs out locally. */
    delete(): Promise<AuthState>
  }
  /** Keeps on-device and signed-in remote data in step. */
  dataSync: {
    /**
     * Merges on-device and remote data both ways; the newer copy of each note, dictionary entry
     * and finished meeting wins, deletions carry over and metrics combine. Audio never moves.
     * Needs on-device mode with a running server and a signed-in remote session.
     */
    run(): Promise<DataSyncResult>
  }
  /** Erases data kept for on-device mode. Remote account data is never touched. */
  localData: {
    /**
     * Permanently deletes every transcript, note, meeting, recording, dictionary entry and
     * metric on the on-device server and in this app's on-device cache. The runtime, models
     * and settings stay. Refused outside on-device mode or while work is in progress.
     */
    erase(): Promise<void>
  }
  /** Performs controlled application window operations. */
  /** Controls the result pop-up above the pill; only the overlay window may call these. */
  transformPopup: {
    /** Grows the pop-up to show the before/after comparison, or shrinks it back. */
    setExpanded(expanded: boolean): Promise<void>
    /** Keeps the pop-up open while the pointer is over it. */
    setPinned(pinned: boolean): Promise<void>
    /** Closes the pop-up. */
    dismiss(): Promise<void>
  }
  window: {
    /** Minimizes the current application window. */
    minimize(): Promise<void>
    /** Toggles maximization and reports the resulting state. */
    maximize(): Promise<WindowState>
    /** Closes the current application window. */
    close(): Promise<void>
    /** Shows and focuses the application hub. */
    showHub(): Promise<void>
    /** Opens the scratchpad window, optionally focused on a local note. */
    openScratchpad(noteId?: string): Promise<void>
  }
  /** Controls only the standalone, non-focusing recording pill. */
  overlay: {
    /** Expands or collapses the idle pill in response to pointer hover. */
    setHovered(hovered: boolean): Promise<void>
    /** Moves the pill using main-owned cursor coordinates, then docks or aborts the gesture. */
    drag(command: 'begin' | 'move' | 'end' | 'cancel'): Promise<void>
    /** Opens the hub and starts Notetaker, as its shortcut would; only the pill may call this. */
    startNotetaker(): Promise<void>
  }
  /** Provides a single-purpose system clipboard operation. */
  clipboard: {
    /** Copies supplied plain text to the operating-system clipboard. */
    copy(text: string): Promise<void>
  }
  /** Exports and reveals safe local diagnostics. */
  diagnostics: {
    /** Exports redacted diagnostics and returns the selected destination. */
    export(): Promise<DiagnosticsExport>
    /** Opens the platform diagnostics location. */
    open(): Promise<void>
  }
  /** Checks the public release feed and opens what it found in the default browser. */
  updates: {
    /** Checks now and resolves with the outcome; a failure is reported in `error`. */
    check(): Promise<UpdateStatus>
    /** Opens the installer download or the release notes of the update on offer. */
    open(target: 'download' | 'release'): Promise<void>
  }
  /** Subscribes to specific main-to-renderer events. */
  events: {
    /** Subscribes to complete renderer-safe state updates. */
    onState(listener: (state: BootstrapState) => void): Unsubscribe
    /** Opens the review-first transform surface or a requested local route. */
    onShortcutAction(listener: (action: 'transform' | 'transformView' | 'startMeeting') => void): Unsubscribe
    /** Subscribes to recording commands issued by native controls or shortcuts. */
    onRecordingCommand(listener: (command: RecordingCommand) => void): Unsubscribe
    /** Subscribes to ephemeral hub audio measurements for the provider-free overlay. */
    onRecordingMeter(listener: (meter: RecordingMeter) => void): Unsubscribe
    /** Subscribes to history invalidation after a local change. */
    onHistoryChanged(listener: () => void): Unsubscribe
    /** Subscribes to notes invalidation after a local change. */
    onNotesChanged(listener: () => void): Unsubscribe
    /** Subscribes to meeting capture commands for the single capture owner. */
    onMeetingCaptureCommand(listener: (command: MeetingCaptureCommand) => void): Unsubscribe
    /** Subscribes to meeting list invalidation. */
    onMeetingsChanged(listener: () => void): Unsubscribe
    /** Opens or updates a review scoped to a main-held native selection. */
    onTransformReview(listener: (review: TransformReview) => void): Unsubscribe
    /** Subscribes to on-device server, installer and model progress. */
    onLocalServerChanged(listener: (status: LocalServerStatus) => void): Unsubscribe
  }
}

declare global {
  /** Augments browser windows in renderer code with the narrow preload bridge. */
  interface Window {
    /** Named desktop API exposed by Electron contextBridge. */
    whisperer: DesktopApi
  }
}

export {}
