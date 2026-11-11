import type {
  ByteProgress,
  ConnectionMode,
  InferenceSettings,
  LlmSettings,
  LlmSettingsInput,
  LocalServerState,
  LocalServerStatus,
  PublicSettings,
  SpeechSettings,
  SpeechSettingsInput,
} from '../../../shared/contracts'
import { ON_DEVICE_SPEECH_MODELS } from '../../../shared/contracts'
import type { SettingsSection } from './SettingsScreen'
import { DEVICE_SECTIONS, SIGN_IN_SECTIONS } from './setup-sections'

/** The default on-device speech model, taken from the shared catalog rather than restated. */
export const DEFAULT_SPEECH_MODEL: string = ON_DEVICE_SPEECH_MODELS[0].id

/** Whether a model id is in the pinned on-device catalog, the only models the server accepts. */
export function isCatalogSpeechModel(model: string): boolean {
  return ON_DEVICE_SPEECH_MODELS.some((entry) => entry.id === model)
}

/** A stopped, empty status used until main reports the first local server state. */
export const IDLE_LOCAL_SERVER: LocalServerStatus = {
  state: 'notInstalled',
  stage: null,
  message: null,
  progress: null,
  port: null,
  log: [],
  canRetry: false,
  speech: { status: 'unknown', model: null, message: null, progress: null },
  llm: { status: 'unknown', model: null, message: null },
}

/** The contract default inference choice: the catalog speech model with the language model off. */
export const DEFAULT_INFERENCE: InferenceSettings = {
  speech: { provider: 'onnx', model: DEFAULT_SPEECH_MODEL },
  llm: { provider: 'off' },
}

export { DEVICE_SECTIONS, SIGN_IN_SECTIONS }

const SETTINGS_SECTIONS: readonly SettingsSection[] = ['general', 'system', 'notetaker', 'inference', 'mcp', 'account', 'privacy']

/** Reads the requested Settings section from the hash query, defaulting to General. */
export function settingsSectionFromHash(hash: string): SettingsSection {
  const requested = new URLSearchParams(hash.split('?')[1] ?? '').get('section')
  return SETTINGS_SECTIONS.find((section) => section === requested) ?? 'general'
}

/** Whether the desktop is using the server it runs on this device. */
export function isDeviceMode(settings: PublicSettings): boolean {
  return settings.connectionMode === 'device'
}

/** Whether the hub may open: device mode needs no sign-in, remote mode needs a session. */
export function canEnterHub(settings: PublicSettings): boolean {
  return isDeviceMode(settings) || settings.authenticated
}

/**
 * Whether a bootstrap update moves the open hub from one backend to the other. Only then does the
 * shell ripple and the page crossfade; a first load or a sign-out replaces the shell instead.
 */
export function backendChanged(previous: PublicSettings | null, next: PublicSettings): boolean {
  if (previous === null || !canEnterHub(previous) || !canEnterHub(next)) return false
  return isDeviceMode(previous) !== isDeviceMode(next)
}

/**
 * What the hub does with a new bootstrap state during a possible backend switch.
 *
 * - `stage`: it crosses backends, so hold it while the old page fades out.
 * - `restage`: a switch is already staged and this newer state replaces it; the newest one wins.
 * - `commit`: apply it now and leave any running animation alone.
 * - `cancel`: apply it now and stop any switch animation. This covers reduced motion, and any
 *   state that leaves the hub, such as signing out mid-switch.
 */
export type BootstrapPlan = 'stage' | 'restage' | 'commit' | 'cancel'

/**
 * Decides how a bootstrap state lands.
 *
 * Args:
 *   committed: Settings on screen now, or null before the first state.
 *   staging: Whether a crossing state is already waiting behind the page fade.
 *   next: Settings just received.
 *   reducedMotion: Whether the user asked for reduced motion.
 *
 * Returns:
 *   The plan for `next`.
 */
export function planBootstrap(committed: PublicSettings | null, staging: boolean, next: PublicSettings, reducedMotion: boolean): BootstrapPlan {
  if (reducedMotion || !canEnterHub(next)) return 'cancel'
  if (backendChanged(committed, next)) return 'stage'
  return staging ? 'restage' : 'commit'
}

/** Reads the local server status, defaulting when an older main process omits it. */
export function readLocalServer(settings: PublicSettings): LocalServerStatus {
  return settings.localServer ?? IDLE_LOCAL_SERVER
}

/** Reads the key-free inference settings, defaulting when an older main process omits them. */
export function readInference(settings: PublicSettings): InferenceSettings {
  return settings.inference ?? DEFAULT_INFERENCE
}

/** What the sidebar indicator shows for the active connection. */
export interface ConnectionIndicatorModel {
  /** Which icon to draw. */
  kind: 'cloud' | 'device'
  /** One-line tooltip and accessible name. It never claims the device is offline. */
  label: string
}

/** Extracts a host name from a saved server URL without exposing paths or credentials. */
export function hostnameOf(apiHost: string | null): string | null {
  if (!apiHost) return null
  try {
    return new URL(apiHost).hostname || null
  } catch {
    return null
  }
}

/** Describes the active connection for the sidebar indicator. */
export function connectionIndicator(settings: PublicSettings): ConnectionIndicatorModel {
  if (isDeviceMode(settings)) return { kind: 'device', label: 'On this device' }
  const host = hostnameOf(settings.apiHost)
  return { kind: 'cloud', label: host ? `Cloud · ${host}` : 'Cloud · no server connected' }
}

const SERVER_STATE_LABELS: Record<LocalServerState, string> = {
  notInstalled: 'Not set up',
  installing: 'Installing',
  stopped: 'Stopped',
  starting: 'Starting',
  ready: 'Running',
  stopping: 'Stopping',
  failed: 'Failed',
}

/** Short status word for the local server row. */
export function serverStateLabel(state: LocalServerState): string {
  return SERVER_STATE_LABELS[state]
}

const SPEECH_STATUS_LABELS: Record<LocalServerStatus['speech']['status'], string> = {
  unknown: 'Waiting for the server',
  unconfigured: 'Not configured',
  missing: 'Model not downloaded',
  downloading: 'Downloading',
  verifying: 'Verifying',
  loading: 'Loading',
  ready: 'Ready',
  failed: 'Failed',
}

/** Short status phrase for the speech row. */
export function speechStatusLabel(status: LocalServerStatus['speech']['status']): string {
  return SPEECH_STATUS_LABELS[status]
}

const LLM_STATUS_LABELS: Record<LocalServerStatus['llm']['status'], string> = {
  unknown: 'Waiting for the server',
  unconfigured: 'Not configured',
  off: 'Off',
  ready: 'Ready',
  failed: 'Failed',
}

/** Short status phrase for the language model row. */
export function llmStatusLabel(status: LocalServerStatus['llm']['status']): string {
  return LLM_STATUS_LABELS[status]
}

/** One local server action the user can take now. */
export type LocalServerAction =
  | { id: 'setup'; label: string }
  | { id: 'restart'; label: string }
  | { id: 'cancel'; label: string }

/**
 * Lists the actions that make sense for a status. Only `setup` downloads anything, and it is
 * offered only as an explicit button, never run on mount.
 */
export function localServerActions(status: LocalServerStatus): LocalServerAction[] {
  switch (status.state) {
    case 'notInstalled':
      return [{ id: 'setup', label: 'Set up on-device mode' }]
    case 'installing':
    case 'starting':
      return [{ id: 'cancel', label: 'Cancel' }]
    case 'failed':
      return [status.canRetry ? { id: 'restart', label: 'Retry' } : { id: 'setup', label: 'Retry setup' }]
    case 'stopped':
      return [status.canRetry ? { id: 'restart', label: 'Start' } : { id: 'setup', label: 'Set up on-device mode' }]
    case 'ready':
      return [{ id: 'restart', label: 'Restart' }]
    case 'stopping':
      return []
  }
}

/** Formats a byte count with binary units, as file managers do. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** Describes real byte progress. An unknown total is stated, never turned into a percentage. */
export function describeProgress(progress: ByteProgress): string {
  if (progress.totalBytes === null || progress.totalBytes <= 0)
    return `${formatBytes(progress.completedBytes)} downloaded`
  return `${formatBytes(progress.completedBytes)} of ${formatBytes(progress.totalBytes)}`
}

/** Whether dictation can run: speech is ready and the language model is ready or off. */
export function inferenceReady(status: LocalServerStatus): boolean {
  return (
    status.state === 'ready' &&
    status.speech.status === 'ready' &&
    (status.llm.status === 'ready' || status.llm.status === 'off')
  )
}

/** Editable endpoint fields. The key is write-only: the saved key is never loaded here. */
export interface EndpointDraft {
  baseUrl: string
  model: string
  /** A newly typed key, or empty to keep whatever is saved. */
  apiKey: string
  /** Whether the user asked to delete the saved key. */
  removeKey: boolean
}

/** Editable speech choice. */
export interface SpeechDraft {
  provider: 'onnx' | 'http'
  /** Full catalog id when `provider` is `onnx`. A saved id outside the catalog is kept only to explain it. */
  onnxModel: string
  endpoint: EndpointDraft
}

/** Editable language model choice. */
export interface LlmDraft {
  provider: 'off' | 'http'
  endpoint: EndpointDraft
}

/** Starts an endpoint draft from saved settings, leaving the key field empty. */
function endpointDraft(saved: { baseUrl: string; model: string } | null): EndpointDraft {
  return { baseUrl: saved?.baseUrl ?? '', model: saved?.model ?? '', apiKey: '', removeKey: false }
}

/** Starts a speech draft from saved settings. */
export function speechDraft(saved: SpeechSettings): SpeechDraft {
  return saved.provider === 'onnx'
    ? { provider: 'onnx', onnxModel: saved.model, endpoint: endpointDraft(null) }
    : { provider: 'http', onnxModel: DEFAULT_SPEECH_MODEL, endpoint: endpointDraft(saved) }
}

/** Starts a language model draft from saved settings. */
export function llmDraft(saved: LlmSettings): LlmDraft {
  return saved.provider === 'off'
    ? { provider: 'off', endpoint: endpointDraft(null) }
    : { provider: 'http', endpoint: endpointDraft(saved) }
}

/** Applies the contract key rule: omitted keeps the saved key, '' removes it, text replaces it. */
function keyField(endpoint: EndpointDraft): { apiKey?: string } {
  if (endpoint.removeKey) return { apiKey: '' }
  return endpoint.apiKey ? { apiKey: endpoint.apiKey } : {}
}

/** Checks an endpoint draft with the same limits main enforces, returning user-facing copy. */
export function endpointError(endpoint: EndpointDraft): string | null {
  const baseUrl = endpoint.baseUrl.trim()
  if (!baseUrl) return 'Enter the endpoint URL.'
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return 'Enter a valid http or https URL.'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Enter a valid http or https URL.'
  if (url.username || url.password) return 'Put the API key in its own field, not in the URL.'
  if (url.search || url.hash) return 'Remove the query or fragment from the URL.'
  if (baseUrl.length > 500) return 'The URL must be at most 500 characters.'
  const model = endpoint.model.trim()
  if (!model) return 'Enter the model name.'
  if (model.length > 200) return 'The model name must be at most 200 characters.'
  if (endpoint.apiKey.length > 4096) return 'The API key must be at most 4096 characters.'
  return null
}

/** Checks a speech draft, returning user-facing copy or null. */
export function speechDraftError(draft: SpeechDraft): string | null {
  if (draft.provider === 'http') return endpointError(draft.endpoint)
  if (!isCatalogSpeechModel(draft.onnxModel.trim()))
    return 'Choose a supported on-device model.'
  return null
}

/** Checks a language model draft, returning user-facing copy or null. */
export function llmDraftError(draft: LlmDraft): string | null {
  return draft.provider === 'http' ? endpointError(draft.endpoint) : null
}

/** Builds the speech update sent to main. */
export function speechInput(draft: SpeechDraft): SpeechSettingsInput {
  if (draft.provider === 'onnx') return { provider: 'onnx', model: draft.onnxModel.trim() }
  return {
    provider: 'http',
    baseUrl: draft.endpoint.baseUrl.trim(),
    model: draft.endpoint.model.trim(),
    ...keyField(draft.endpoint),
  }
}

/** Builds the language model update sent to main. */
export function llmInput(draft: LlmDraft): LlmSettingsInput {
  if (draft.provider === 'off') return { provider: 'off' }
  return {
    provider: 'http',
    baseUrl: draft.endpoint.baseUrl.trim(),
    model: draft.endpoint.model.trim(),
    ...keyField(draft.endpoint),
  }
}

/** Whether a speech draft differs from what is saved, so a test would not reflect it. */
export function speechDraftDirty(draft: SpeechDraft, saved: SpeechSettings): boolean {
  if (draft.provider !== saved.provider) return true
  if (saved.provider === 'onnx') return draft.onnxModel.trim() !== saved.model
  return endpointDirty(draft.endpoint, saved)
}

/** Whether a language model draft differs from what is saved. */
export function llmDraftDirty(draft: LlmDraft, saved: LlmSettings): boolean {
  if (draft.provider !== saved.provider) return true
  return saved.provider === 'http' ? endpointDirty(draft.endpoint, saved) : false
}

/** Whether endpoint fields differ from saved values or a key change is pending. */
function endpointDirty(endpoint: EndpointDraft, saved: { baseUrl: string; model: string }): boolean {
  return (
    endpoint.baseUrl.trim() !== saved.baseUrl ||
    endpoint.model.trim() !== saved.model ||
    endpoint.apiKey !== '' ||
    endpoint.removeKey
  )
}

const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]'],
  [/\b(api[_-]?key|token|secret|password|authorization|boot[_-]?token)(["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1$2[redacted]'],
  [/\b(sk|hf|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{8,}/g, '[redacted]'],
  [/(\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1[redacted]@'],
]

/** Main already sanitizes activity lines; this second pass keeps any key-shaped text off screen. */
export function redactLogLine(line: string): string {
  return SECRET_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), line).slice(0, 300)
}

/** Names where dictation audio goes, for the privacy row. Honest about remote endpoints. */
export function speechDestination(settings: PublicSettings): string {
  if (!isDeviceMode(settings)) {
    const host = hostnameOf(settings.apiHost)
    return host ? `Dictation audio is sent to your Whisperer server at ${host}.` : 'No server is connected.'
  }
  const speech = readInference(settings).speech
  if (speech.provider === 'onnx') return 'Dictation audio is transcribed by the server on this device.'
  const host = hostnameOf(speech.baseUrl)
  return `Dictation audio is sent to the speech endpoint at ${host ?? 'the address you entered'}.`
}

/** Where recorded or imported meeting audio goes and how long it is kept, for the Notetaker settings. */
export function meetingAudioDestination(settings: PublicSettings): string {
  if (!isDeviceMode(settings)) {
    const host = hostnameOf(settings.apiHost)
    return `Meeting audio, recorded or imported, is uploaded to your Whisperer server${host ? ` at ${host}` : ''}, which keeps it until you delete the meeting. A copy stays on this computer for playback.`
  }
  const speech = readInference(settings).speech
  if (speech.provider === 'onnx') return 'Meeting audio stays on this computer and is transcribed by the server on this device. It is kept until you delete the meeting.'
  const host = hostnameOf(speech.baseUrl)
  return `Meeting audio is kept on this computer until you delete the meeting, and is sent to the speech endpoint at ${host ?? 'the address you entered'} for transcription.`
}

/** Where polish, transforms, summaries and meeting questions send text. */
export function languageModelDestination(settings: PublicSettings): string {
  if (!isDeviceMode(settings)) {
    const host = hostnameOf(settings.apiHost)
    return `Polish, transforms, note and meeting summaries and meeting questions send text to the language model your Whisperer server${host ? ` at ${host}` : ''} uses.`
  }
  const llm = readInference(settings).llm
  if (llm.provider === 'off') return 'The language model is off, so no text is sent for polish, transforms, summaries or questions.'
  const host = hostnameOf(llm.baseUrl)
  return `Polish, transforms, note and meeting summaries and meeting questions send text to the language model at ${host ?? 'the address you entered'}.`
}

/** What the top-bar connection toggle shows and whether it may be flipped. */
export interface ConnectionToggleModel {
  /** Which side the switch rests on. */
  mode: ConnectionMode
  /** Whether the user may flip it now. */
  enabled: boolean
  /** Short tooltip. When disabled it says what to configure first. */
  tooltip: string
}

/**
 * Decides the top-bar toggle. Flipping needs both sides to be usable: a remote session for cloud
 * and an installed runtime for this device. With only one side, the switch rests there, disabled,
 * and the tooltip names what to set up in Inference settings.
 */
export function connectionToggle(settings: PublicSettings): ConnectionToggleModel {
  const mode: ConnectionMode = isDeviceMode(settings) ? 'device' : 'remote'
  const cloudReady = settings.authenticated
  const deviceReady = settings.runtimeInstalled === true
  if (cloudReady && deviceReady) {
    return { mode, enabled: true, tooltip: mode === 'device' ? 'On this device · switch to cloud' : `Cloud · ${hostnameOf(settings.apiHost) ?? 'server'} · switch to this device` }
  }
  if (mode === 'device') return { mode, enabled: false, tooltip: 'On this device · sign in to a server to enable cloud' }
  return { mode, enabled: false, tooltip: 'Cloud · set up on-device inference in Settings to enable switching' }
}
