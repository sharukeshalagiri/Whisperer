/**
 * Runtime-validated IPC vocabulary shared by Electron main and preload code.
 *
 * Every renderer request uses a named channel and a `{ ok, data | error }`
 * envelope. Main-process handlers must validate their sender and the matching
 * request schema before carrying out an operation.
 */

import { z } from 'zod'
import { defaultShortcutBindings } from './shortcuts'
import { ON_DEVICE_SPEECH_MODELS, type InferenceSettings, type LocalServerStatus } from './contracts'

/** Defines every permitted request and event channel exactly once. */
export const CHANNELS = {
  app: {
    bootstrap: 'app:bootstrap',
  },
  auth: {
    signIn: 'auth:sign-in',
    cancel: 'auth:cancel',
    signOut: 'auth:sign-out',
  },
  settings: {
    update: 'settings:update',
    shortcutCapture: 'settings:shortcut-capture',
    setConnectionMode: 'settings:set-connection-mode',
  },
  localServer: {
    setup: 'local-server:setup',
    restart: 'local-server:restart',
    cancel: 'local-server:cancel',
  },
  inference: {
    update: 'inference:update',
    test: 'inference:test',
    downloadModel: 'inference:download-model',
  },
  permissions: {
    list: 'permissions:list',
    request: 'permissions:request',
    openSettings: 'permissions:open-settings',
    check: 'permissions:check',
  },
  recording: {
    start: 'recording:start',
    stop: 'recording:stop',
    cancel: 'recording:cancel',
    submit: 'recording:submit',
    reportPhase: 'recording:report-phase',
    reportMeter: 'recording:report-meter',
  },
  history: {
    list: 'history:list',
    delete: 'history:delete',
    clear: 'history:clear',
    copy: 'history:copy',
  },
  notes: {
    list: 'notes:list',
    save: 'notes:save',
    delete: 'notes:delete',
    summarize: 'notes:summarize',
    open: 'notes:open',
  },
  dictionary: {
    list: 'dictionary:list',
    save: 'dictionary:save',
    delete: 'dictionary:delete',
  },
  snippets: {
    list: 'snippets:list',
    save: 'snippets:save',
    delete: 'snippets:delete',
  },
  meetings: {
    list: 'meetings:list',
    save: 'meetings:save',
    delete: 'meetings:delete',
    captureStart: 'meetings:capture-start',
    captureStop: 'meetings:capture-stop',
    captureCancel: 'meetings:capture-cancel',
    captureAppend: 'meetings:capture-append',
    captureFinish: 'meetings:capture-finish',
    captureFail: 'meetings:capture-fail',
    importAudio: 'meetings:import-audio',
    exportAudio: 'meetings:export-audio',
    get: 'meetings:get',
    saveTranscript: 'meetings:save-transcript',
    saveSummary: 'meetings:save-summary',
    ask: 'meetings:ask',
    regenerateSummary: 'meetings:regenerate-summary',
    resume: 'meetings:resume',
    retry: 'meetings:retry',
    sync: 'meetings:sync',
  },
  metrics: {
    get: 'metrics:get',
    daily: 'metrics:daily',
    apps: 'metrics:apps',
  },
  transformations: {
    list: 'transformations:list',
    save: 'transformations:save',
    delete: 'transformations:delete',
    reset: 'transformations:reset',
    start: 'transformations:start',
    preview: 'transformations:preview',
    view: 'transformations:view',
    generate: 'transformations:generate',
    accept: 'transformations:accept',
    reject: 'transformations:reject',
    runQuick: 'transformations:run-quick',
  },
  account: {
    save: 'account:save',
    delete: 'account:delete',
  },
  dataSync: {
    run: 'data-sync:run',
  },
  localData: {
    erase: 'local-data:erase',
  },
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    close: 'window:close',
    showHub: 'window:show-hub',
    openScratchpad: 'window:open-scratchpad',
  },
  overlay: {
    setHovered: 'overlay:set-hovered',
    drag: 'overlay:drag',
    startNotetaker: 'overlay:start-notetaker',
  },
  transformPopup: {
    setExpanded: 'transform-popup:set-expanded',
    setPinned: 'transform-popup:set-pinned',
    dismiss: 'transform-popup:dismiss',
  },
  clipboard: {
    copy: 'clipboard:copy',
  },
  diagnostics: {
    export: 'diagnostics:export',
    open: 'diagnostics:open',
  },
  updates: {
    check: 'updates:check',
    open: 'updates:open',
  },
  events: {
    state: 'event:state',
    shortcutAction: 'event:shortcut-action',
    recordingCommand: 'event:recording-command',
    recordingMeter: 'event:recording-meter',
    historyChanged: 'event:history-changed',
    notesChanged: 'event:notes-changed',
    meetingCaptureCommand: 'event:meeting-capture-command',
    meetingsChanged: 'event:meetings-changed',
    transformReview: 'event:transform-review',
    localServerChanged: 'event:local-server-changed',
  },
} as const

/** Constrains values in IPC records to a non-empty trimmed string. */
const nonEmptyString = z.string().trim().min(1)

/** Validates ISO-like timestamps without imposing a locale. */
const timestampSchema = nonEmptyString

/** Validates a request payload with no fields. */
const emptyRequestSchema = z.object({}).strict()

/** Validates a renderer-safe public API host. */
const apiHostSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }, 'Expected an HTTP or HTTPS API host')

/** Validates the values accepted by the application theme setting. */
export const themeSchema = z.enum(['light', 'dark', 'system'])

/** Validates all recording lifecycle statuses. */
export const recordingStatusSchema = z.enum([
  'idle',
  'starting',
  'recording',
  'stopping',
  'processing',
  'error',
])

/** Bounds transient meter data independently of the durable application state. */
export const recordingMeterSchema = z.object({
  level: z.number().finite().min(0).max(1),
  elapsedMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  source: z.enum(['dictation', 'meeting']).optional(),
}).strict()

/** Validates commands delivered from the main process to recording UI. */
export const recordingCommandSchema = z.enum(['start', 'stop', 'cancel'])

/** Validates renderer capture and submission phases. */
export const recordingCapturePhaseSchema = z.enum([
  'idle',
  'capturing',
  'captured',
  'submitting',
  'submitted',
  'cancelled',
  'failed',
])

/** Validates named capabilities. */
export const capabilityIdSchema = z.enum([
  'microphone',
  'accessibility',
  'automation',
  'globalShortcut',
  'autoPaste',
  'holdToTalk',
  'systemAudio',
])

/** Validates an individual platform capability report. */
export const capabilitySchema = z
  .object({
    supported: z.boolean(),
    granted: z.boolean(),
    reason: z.string().nullable(),
  })
  .strict()

/** Validates the complete renderer-visible capability report. */
export const capabilitiesSchema = z
  .object({
    microphone: capabilitySchema,
    accessibility: capabilitySchema,
    automation: capabilitySchema,
    globalShortcut: capabilitySchema,
    autoPaste: capabilitySchema,
    holdToTalk: capabilitySchema,
    systemAudio: capabilitySchema,
  })
  .strict()

/** Validates independent action bindings with a four-chord limit. */
export const shortcutBindingsSchema = z.object({
  holdToTalk: z.array(z.string().min(1).max(100)).max(4),
  toggleRecording: z.array(z.string().min(1).max(100)).max(4),
  pressEnter: z.array(z.string().min(1).max(100)).max(4),
  pasteLastTranscript: z.array(z.string().min(1).max(100)).max(4),
  copyLastTranscript: z.array(z.string().min(1).max(100)).max(4),
  scratchpad: z.array(z.string().min(1).max(100)).max(4),
  startMeeting: z.array(z.string().min(1).max(100)).max(4),
  transform: z.array(z.string().min(1).max(100)).max(1),
  transformView: z.array(z.string().min(1).max(100)).max(4),
  cancel: z.array(z.string().min(1).max(100)).max(1),
}).strict()

/** Validates the selected backend. */
export const connectionModeSchema = z.enum(['remote', 'device'])

/** Validates an inference endpoint URL: HTTP(S), no credentials, query or fragment. */
export const inferenceBaseUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((value) => {
    const url = new URL(value)
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
    return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) && !url.username && !url.password && !url.search && !url.hash
  }, 'Use HTTPS, or HTTP only for this computer, without credentials')

/** Validates a provider model name. */
const inferenceModelSchema = z.string().trim().min(1).max(200)

/** Validates an on-device speech model against the server catalog. */
export const onDeviceModelSchema = z.string().refine(
  (value) => ON_DEVICE_SPEECH_MODELS.some((model) => model.id === value),
  'Choose a supported on-device model',
)

/** Validates an optional provider key in an update request. */
const apiKeyInputSchema = z.string().max(4096).optional()

/** Validates public speech settings. */
export const speechSettingsSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('onnx'), model: onDeviceModelSchema }).strict(),
  z.object({ provider: z.literal('http'), baseUrl: inferenceBaseUrlSchema, model: inferenceModelSchema, hasApiKey: z.boolean() }).strict(),
])

/** Validates public language-model settings. */
export const llmSettingsSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('off') }).strict(),
  z.object({ provider: z.literal('http'), baseUrl: inferenceBaseUrlSchema, model: inferenceModelSchema, hasApiKey: z.boolean() }).strict(),
])

/** Validates key-free inference settings. */
export const inferenceSettingsSchema = z.object({ speech: speechSettingsSchema, llm: llmSettingsSchema }).strict()

/** Default inference settings for profiles without saved values. */
export function defaultInferenceSettings(): InferenceSettings {
  return { speech: { provider: 'onnx', model: 'istupakov/parakeet-tdt-0.6b-v3-onnx' }, llm: { provider: 'off' } }
}

/** Validates a renderer inference update. */
export const inferenceUpdateSchema = z
  .object({
    speech: z.discriminatedUnion('provider', [
      z.object({ provider: z.literal('onnx'), model: onDeviceModelSchema }).strict(),
      z.object({ provider: z.literal('http'), baseUrl: inferenceBaseUrlSchema, model: inferenceModelSchema, apiKey: apiKeyInputSchema }).strict(),
    ]).optional(),
    llm: z.discriminatedUnion('provider', [
      z.object({ provider: z.literal('off') }).strict(),
      z.object({ provider: z.literal('http'), baseUrl: inferenceBaseUrlSchema, model: inferenceModelSchema, apiKey: apiKeyInputSchema }).strict(),
    ]).optional(),
  })
  .strict()
  .refine((value) => value.speech !== undefined || value.llm !== undefined, 'Choose an engine to update')

/** Validates byte progress. */
const byteProgressSchema = z
  .object({ completedBytes: z.number().int().nonnegative(), totalBytes: z.number().int().nonnegative().nullable() })
  .strict()

/** Validates renderer-safe on-device server status. */
export const localServerStatusSchema = z
  .object({
    state: z.enum(['notInstalled', 'installing', 'stopped', 'starting', 'ready', 'stopping', 'failed']),
    stage: z.enum(['uv', 'python', 'packages', 'launch', 'database', 'verify']).nullable(),
    message: z.string().max(500).nullable(),
    progress: byteProgressSchema.nullable(),
    port: z.number().int().min(1).max(65535).nullable(),
    log: z.array(z.string().max(300)).max(100),
    canRetry: z.boolean(),
    speech: z
      .object({
        status: z.enum(['unknown', 'unconfigured', 'missing', 'downloading', 'verifying', 'loading', 'ready', 'failed']),
        model: z.string().max(200).nullable(),
        message: z.string().max(500).nullable(),
        progress: byteProgressSchema.nullable(),
      })
      .strict(),
    llm: z
      .object({
        status: z.enum(['unknown', 'unconfigured', 'off', 'ready', 'failed']),
        model: z.string().max(200).nullable(),
        message: z.string().max(500).nullable(),
      })
      .strict(),
  })
  .strict()

/** Returns the status used before the main process reports any on-device activity. */
export function idleLocalServerStatus(): LocalServerStatus {
  return {
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
}

/** Validates an explicit engine test result. */
export const inferenceTestResultSchema = z
  .object({ ok: z.boolean(), latencyMs: z.number().finite().nonnegative().nullable(), message: z.string().max(500) })
  .strict()

/** Validates settings that are safe to send to renderer code. */
export const publicSettingsSchema = z
  .object({
    connectionMode: connectionModeSchema.default('remote'),
    localServer: localServerStatusSchema.default(() => idleLocalServerStatus()),
    inference: inferenceSettingsSchema.default(() => defaultInferenceSettings()),
    runtimeInstalled: z.boolean().default(false),
    apiHost: apiHostSchema.nullable(),
    authenticated: z.boolean(),
    secureCredentials: z.boolean(),
    language: nonEmptyString,
    polish: z.boolean(),
    autoPaste: z.boolean(),
    shortcut: z.string(),
    shortcutBindings: shortcutBindingsSchema.default(defaultShortcutBindings()),
    microphoneId: z.string().nullable(),
    onboardingCompleted: z.boolean(),
    launchAtLogin: z.boolean(),
    checkUpdatesAutomatically: z.boolean(),
    theme: themeSchema,
    retainAudio: z.boolean(),
    holdToTalk: z.boolean(),
    showStatusBar: z.boolean(),
    syncAtStartup: z.boolean().default(false),
    scratchpadInBar: z.boolean(),
    scratchpadShortcut: z.string().max(100),
    transformsEnabled: z.boolean(),
    autoAfterDictationTransform: z.object({ active: z.boolean(), definitionId: z.string().nullable() }).strict(),
  })
  .strict()

/** Validates the renderer-editable subset of public settings. */
export const publicSettingsUpdateSchema = z
  .object({
    language: nonEmptyString.optional(),
    polish: z.boolean().optional(),
    autoPaste: z.boolean().optional(),
    shortcut: z.string().optional(),
    shortcutBindings: shortcutBindingsSchema.optional(),
    microphoneId: z.string().nullable().optional(),
    onboardingCompleted: z.boolean().optional(),
    launchAtLogin: z.boolean().optional(),
    checkUpdatesAutomatically: z.boolean().optional(),
    theme: themeSchema.optional(),
    retainAudio: z.boolean().optional(),
    holdToTalk: z.boolean().optional(),
    showStatusBar: z.boolean().optional(),
    syncAtStartup: z.boolean().optional(),
    scratchpadInBar: z.boolean().optional(),
    scratchpadShortcut: z.string().max(100).optional(),
    transformsEnabled: z.boolean().optional(),
    autoAfterDictationTransform: z.object({ active: z.boolean(), definitionId: z.string().nullable() }).strict().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one setting is required')

/** Validates public user account data. */
export const userSchema = z
  .object({
    id: nonEmptyString,
    email: z.string().email().nullable(),
    displayName: nonEmptyString,
  })
  .strict()

/** Validates recording state delivered to renderer code. */
export const recordingStateSchema = z
  .object({
    status: recordingStatusSchema,
    mode: z.enum(['handsfree', 'push-to-talk']).optional(),
    capturePhase: recordingCapturePhaseSchema,
    startedAt: timestampSchema.nullable(),
    error: z.string().nullable(),
  })
  .strict()

/** Validates the shortcut transform shown on the pill and its result pop-up. */
export const transformActivitySchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('applying'), name: z.string().min(1).max(80) }).strict(),
  z.object({ phase: z.literal('applied'), name: z.string().min(1).max(80), sourceText: z.string().max(200_000), proposal: z.string().max(200_000), expanded: z.boolean().optional() }).strict(),
  z.object({ phase: z.literal('failed'), name: z.string().min(1).max(80), message: z.string().max(300) }).strict(),
])

/** Validates an active local meeting capture. */
export const meetingCaptureStateSchema = z
  .object({
    id: nonEmptyString,
    title: z.string().max(200),
    status: z.enum(['starting', 'recording', 'stopping', 'error']),
    startedAt: timestampSchema,
    error: z.string().max(500).nullable(),
  })
  .strict()

/** Validates commands for the meeting capture owner. */
export const meetingCaptureCommandSchema = z
  .object({ command: z.enum(['start', 'stop', 'cancel']), id: nonEmptyString, title: z.string().max(200) })
  .strict()

/** Validates the renderer-safe startup state. */
/** Validates one offered release; main also applies it to feed data before keeping it. */
export const updateInfoSchema = z
  .object({
    version: nonEmptyString,
    name: nonEmptyString,
    prerelease: z.boolean(),
    publishedAt: timestampSchema.nullable(),
    pageUrl: z.url({ protocol: /^https?$/ }),
    downloadUrl: z.url({ protocol: /^https?$/ }),
    assetName: nonEmptyString,
    bytes: z.number().int().nonnegative(),
  })
  .strict()

/** Validates the release-feed check result shown in notifications and Settings. */
export const updateStatusSchema = z
  .object({
    currentVersion: nonEmptyString,
    checking: z.boolean(),
    checkedAt: timestampSchema.nullable(),
    update: updateInfoSchema.nullable(),
    error: z.string().nullable(),
  })
  .strict()

export const bootstrapStateSchema = z
  .object({
    settings: publicSettingsSchema,
    user: userSchema.nullable(),
    capabilities: capabilitiesSchema,
    version: nonEmptyString,
    platform: z.enum(['darwin', 'win32', 'linux']),
    recording: recordingStateSchema,
    meetingCapture: meetingCaptureStateSchema.nullable(),
    transform: transformActivitySchema.nullable(),
    quickTransform: z.object({ id: nonEmptyString, name: z.string().min(1).max(80) }).strict().nullable(),
    overlayDockEdge: z.enum(['bottom', 'left', 'right']),
    updates: updateStatusSchema,
    signInCode: z.string().regex(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/).nullable(),
  })
  .strict()

/** Validates public authentication state. */
export const authStateSchema = z
  .object({
    settings: publicSettingsSchema,
    user: userSchema.nullable(),
  })
  .strict()

/** Validates persisted transcription history. */
export const historyEntrySchema = z
  .object({
    id: nonEmptyString,
    text: z.string(),
    rawText: z.string(),
    createdAt: timestampSchema,
    durationMs: z.number().finite().nonnegative(),
    language: nonEmptyString,
    appName: z.string().nullable(),
    pasted: z.boolean(),
    status: z.enum(['processing', 'completed', 'failed']),
    dictionaryReplacements: z.number().int().nonnegative().optional(),
  })
  .strict()

/** Validates audio supplied from the renderer for transcription. */
export const recordingSubmissionSchema = z
  .object({
    audio: z.instanceof(Uint8Array),
    durationMs: z.number().finite().nonnegative(),
    contentType: nonEmptyString,
    filename: nonEmptyString.refine(
      (value) => !/[\\/]/.test(value) && !value.includes('\u0000'),
      'Filename must not contain path separators or a null character',
    ),
  })
  .strict()

/** Validates recording submission results. */
export const recordingSubmissionResultSchema = z
  .object({
    historyEntry: historyEntrySchema,
    capturePhase: z.enum(['submitted', 'failed']),
  })
  .strict()

/** Validates a renderer report about its local capture lifecycle. */
export const recordingPhaseReportSchema = z
  .object({
    capturePhase: recordingCapturePhaseSchema,
    error: z.string().optional(),
  })
  .strict()

/** Validates a locally stored note. */
export const noteSchema = z
  .object({
    id: nonEmptyString,
    title: z.string(),
    content: z.string(),
    summary: z.string().nullable(),
    updatedAt: timestampSchema,
    pinned: z.boolean(),
    localOnly: z.boolean(),
    syncState: z.enum(['local', 'pending', 'synced', 'error']),
  })
  .strict()

/** Validates fields accepted by note creation and update. */
export const noteSaveSchema = z
  .object({
    id: nonEmptyString.optional(),
    title: z.string(),
    content: z.string(),
    pinned: z.boolean().optional(),
    localOnly: z.boolean().optional(),
  })
  .strict()

/** Validates a local dictionary entry. */
export const dictionaryEntrySchema = z
  .object({
    id: nonEmptyString,
    phrase: nonEmptyString,
    replacement: z.string(),
  })
  .strict()

/** Validates dictionary entry creation and update fields. */
export const dictionarySaveSchema = z
  .object({
    id: nonEmptyString.optional(),
    phrase: nonEmptyString,
    replacement: z.string(),
  })
  .strict()

/** Validates a locally stored reusable text snippet. */
export const snippetSchema = z
  .object({
    id: nonEmptyString,
    shortcut: nonEmptyString,
    text: z.string(),
    useCount: z.number().int().nonnegative(),
  })
  .strict()

/** Validates text snippet creation and update fields. */
export const snippetSaveSchema = z
  .object({
    id: nonEmptyString.optional(),
    shortcut: nonEmptyString,
    text: z.string(),
  })
  .strict()

/** Validates local meeting metadata. */
export const meetingProcessingStatusSchema = z.enum(['pending', 'running', 'complete', 'failed', 'idle'])

/** Validates the durable local synchronization state for a scoped meeting cache. */
export const meetingSyncStateSchema = z.enum(['local', 'pending', 'synced', 'error'])

/** Validates local and authoritative meeting data. New authoritative fields remain optional for old caches. */
export const meetingSchema = z
  .object({
    id: nonEmptyString,
    title: z.string(),
    startedAt: timestampSchema,
    endedAt: timestampSchema.nullable(),
    durationMs: z.number().finite().nonnegative(),
    historyEntryIds: z.array(nonEmptyString),
    hasAudio: z.boolean(),
    transcript: z.string().optional(),
    transcriptRevision: z.number().int().nonnegative().optional(),
    summary: z.string().optional(),
    summaryRevision: z.number().int().nonnegative().optional(),
    summarySourceRevision: z.number().int().nonnegative().nullable().optional(),
    summaryStale: z.boolean().optional(),
    revision: z.number().int().nonnegative().optional(),
    transcriptStatus: meetingProcessingStatusSchema.optional(),
    summaryStatus: meetingProcessingStatusSchema.optional(),
    syncState: meetingSyncStateSchema.optional(),
    error: z.string().nullable().optional(),
  })
  .strict()

/** Validates a revisioned authoritative meeting text replacement. */
export const meetingTextSaveSchema = z
  .object({ id: nonEmptyString, text: z.string(), revision: z.number().int().nonnegative() })
  .strict()

/** Validates a bounded question and optional saved-source revision expectations. */
export const meetingQuestionInputSchema = z.object({
  id: nonEmptyString,
  question: z.string().trim().min(1).max(2_000),
  transcriptRevision: z.number().int().nonnegative().optional(),
  summaryRevision: z.number().int().nonnegative().optional(),
}).strict()

/** Validates the renderer-safe answer and saved revisions returned by the backend. */
export const meetingQuestionAnswerSchema = z.object({
  answer: z.string().min(1).max(20_000),
  transcriptRevision: z.number().int().nonnegative(),
  summaryRevision: z.number().int().nonnegative(),
  summaryStale: z.boolean(),
  usedSummary: z.boolean(),
}).strict()

/** Validates aggregate account metrics provided by the authoritative API. */
export const metricsSchema = z
  .object({
    totalWords: z.number().finite().nonnegative(), totalDurationMs: z.number().finite().nonnegative(),
    dictationCount: z.number().int().nonnegative(), dictionaryReplacements: z.number().int().nonnegative(),
    correctedWords: z.number().int().nonnegative(), wordsPerMinute: z.number().finite().nonnegative(),
    wordsToday: z.number().finite().nonnegative(), wordsThisWeek: z.number().finite().nonnegative(),
    wordsThisMonth: z.number().finite().nonnegative(), wordsLastMonth: z.number().finite().nonnegative(),
    activeDays: z.number().int().nonnegative(), dayStreak: z.number().int().nonnegative(),
    longestDayStreak: z.number().int().nonnegative(), weekStreak: z.number().int().nonnegative(), timeZone: nonEmptyString,
  })
  .strict()

/** A calendar date as YYYY-MM-DD. */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Validates one daily metric bucket. */
export const dailyMetricSchema = z.object({
  date: nonEmptyString, words: z.number().finite().nonnegative(), durationMs: z.number().finite().nonnegative(),
  dictationCount: z.number().int().nonnegative(), dictionaryReplacements: z.number().int().nonnegative(),
  correctedWords: z.number().int().nonnegative(),
}).strict()

/** Validates one application metric bucket. */
export const appMetricSchema = z.object({
  appName: nonEmptyString, words: z.number().finite().nonnegative(), durationMs: z.number().finite().nonnegative(), dictationCount: z.number().int().nonnegative(),
}).strict()

/** Bounds a user-authored prompt while leaving server-specific behavior to the existing endpoint. */
const transformPromptSchema = z.string().trim().min(1).max(2000)

/** Validates one local transform definition safe for renderer display. */
export const transformDefinitionSchema = z.object({
  id: z.string().regex(/^(?:polish|prompt-engineer|decompose|custom-[a-zA-Z0-9-]+)$/),
  name: z.string().trim().min(1).max(80),
  prompt: transformPromptSchema,
  shortcut: z.string().max(100),
  builtIn: z.boolean(),
}).strict()

/** Validates a local transform definition write. */
export const transformDefinitionSaveSchema = z.object({
  id: z.string().regex(/^(?:polish|prompt-engineer|decompose|custom-[a-zA-Z0-9-]+)$/).optional(),
  name: z.string().trim().min(1).max(80),
  prompt: transformPromptSchema,
  shortcut: z.string().max(100),
}).strict()

/** Validates renderer-safe references to a main-held review session. */
export const transformReviewSchema = z.object({
  sessionId: nonEmptyString,
  sourceText: z.string().min(1).max(100_000),
  definition: transformDefinitionSchema,
  proposal: z.string().nullable(),
  canApply: z.boolean(),
}).strict()

/** Validates an explicit non-pasting transformation request. */
export const transformationInputSchema = z.object({
  text: z.string(), kind: z.enum(['polish', 'shorten', 'expand', 'tone', 'translate', 'custom']), instruction: z.string().optional(), targetLanguage: z.string().optional(),
}).strict()

/** Validates a server transformation response. */
export const transformationResultSchema = z.object({ id: nonEmptyString, text: z.string() }).strict()

/** Bounds one meeting audio chunk; MediaRecorder emits about one second per chunk. */
const MAX_MEETING_CHUNK_BYTES = 4 * 1024 * 1024

/** Validates local meeting metadata creation and update fields. */
export const meetingSaveSchema = z
  .object({
    id: nonEmptyString.optional(),
    title: z.string(),
    startedAt: timestampSchema,
    endedAt: timestampSchema.nullable().optional(),
    durationMs: z.number().finite().nonnegative(),
    historyEntryIds: z.array(nonEmptyString).optional(),
  })
  .strict()

/** Validates diagnostics export results. */
export const diagnosticsExportSchema = z
  .object({
    path: z.string().nullable(),
  })
  .strict()

/** Validates a resulting native window state. */
export const windowStateSchema = z
  .object({
    maximized: z.boolean(),
  })
  .strict()

/** Validates the safe error payload used for every failed IPC request. */
export const ipcFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: nonEmptyString,
        message: nonEmptyString,
      })
      .strict(),
  })
  .strict()

/** Builds the standard `{ ok: true, data } | { ok: false, error }` envelope. */
export function ipcResultSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        data: dataSchema,
      })
      .strict(),
    ipcFailureSchema,
  ])
}

/** Defines the runtime schemas required for one invoke request. */
export interface IpcRuntimeSpec {
  /** Validates the untrusted payload received by the main-process handler. */
  request: z.ZodType
  /** Validates the result envelope returned to the sandboxed renderer. */
  response: z.ZodType
}

/** Defines the runtime schema required for one main-to-renderer event. */
export interface EventRuntimeSpec {
  /** Validates the event payload before it is sent or consumed. */
  payload: z.ZodType
}

/** Validates all renderer-to-main requests and their result envelopes. */
export const IPC_RUNTIME_SPECS = {
  [CHANNELS.app.bootstrap]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(bootstrapStateSchema),
  },
  [CHANNELS.auth.signIn]: {
    request: z.object({ apiHost: apiHostSchema }).strict(),
    response: ipcResultSchema(authStateSchema),
  },
  [CHANNELS.auth.cancel]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(authStateSchema),
  },
  [CHANNELS.auth.signOut]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(authStateSchema),
  },
  [CHANNELS.settings.update]: {
    request: publicSettingsUpdateSchema,
    response: ipcResultSchema(publicSettingsSchema),
  },
  [CHANNELS.settings.shortcutCapture]: {
    request: z.object({ active: z.boolean() }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.settings.setConnectionMode]: {
    request: z.object({ mode: connectionModeSchema }).strict(),
    response: ipcResultSchema(authStateSchema),
  },
  [CHANNELS.localServer.setup]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(localServerStatusSchema),
  },
  [CHANNELS.localServer.restart]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(localServerStatusSchema),
  },
  [CHANNELS.localServer.cancel]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(localServerStatusSchema),
  },
  [CHANNELS.inference.update]: {
    request: inferenceUpdateSchema,
    response: ipcResultSchema(publicSettingsSchema),
  },
  [CHANNELS.inference.test]: {
    request: z.object({ target: z.enum(['speech', 'llm']) }).strict(),
    response: ipcResultSchema(inferenceTestResultSchema),
  },
  [CHANNELS.inference.downloadModel]: {
    request: z.object({ model: onDeviceModelSchema }).strict(),
    response: ipcResultSchema(localServerStatusSchema),
  },
  [CHANNELS.permissions.list]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(capabilitiesSchema),
  },
  [CHANNELS.permissions.request]: {
    request: z.object({ capability: capabilityIdSchema }).strict(),
    response: ipcResultSchema(capabilitySchema),
  },
  [CHANNELS.permissions.check]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(capabilitiesSchema),
  },
  [CHANNELS.permissions.openSettings]: {
    request: z.object({ capability: z.enum(['microphone', 'accessibility', 'automation']) }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.recording.start]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(recordingStateSchema),
  },
  [CHANNELS.recording.stop]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(recordingStateSchema),
  },
  [CHANNELS.recording.cancel]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(recordingStateSchema),
  },
  [CHANNELS.recording.submit]: {
    request: recordingSubmissionSchema,
    response: ipcResultSchema(recordingSubmissionResultSchema),
  },
  [CHANNELS.recording.reportPhase]: {
    request: recordingPhaseReportSchema,
    response: ipcResultSchema(recordingStateSchema),
  },
  [CHANNELS.recording.reportMeter]: {
    request: recordingMeterSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.overlay.setHovered]: {
    request: z.object({ hovered: z.boolean() }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.overlay.drag]: {
    request: z.object({ command: z.enum(['begin', 'move', 'end', 'cancel']) }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.overlay.startNotetaker]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.transformPopup.setExpanded]: {
    request: z.object({ expanded: z.boolean() }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.transformPopup.setPinned]: {
    request: z.object({ pinned: z.boolean() }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.transformPopup.dismiss]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.history.list]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(historyEntrySchema)),
  },
  [CHANNELS.history.delete]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.history.clear]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.history.copy]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.notes.list]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(noteSchema)),
  },
  [CHANNELS.notes.save]: {
    request: noteSaveSchema,
    response: ipcResultSchema(noteSchema),
  },
  [CHANNELS.notes.delete]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.notes.summarize]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(noteSchema),
  },
  [CHANNELS.notes.open]: {
    request: z.object({ id: nonEmptyString.optional() }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.dictionary.list]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(dictionaryEntrySchema)),
  },
  [CHANNELS.dictionary.save]: {
    request: dictionarySaveSchema,
    response: ipcResultSchema(dictionaryEntrySchema),
  },
  [CHANNELS.dictionary.delete]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.snippets.list]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(snippetSchema)),
  },
  [CHANNELS.snippets.save]: {
    request: snippetSaveSchema,
    response: ipcResultSchema(snippetSchema),
  },
  [CHANNELS.snippets.delete]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.meetings.list]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(meetingSchema)),
  },
  [CHANNELS.meetings.get]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(meetingSchema.nullable()),
  },
  [CHANNELS.meetings.saveTranscript]: {
    request: meetingTextSaveSchema,
    response: ipcResultSchema(meetingSchema),
  },
  [CHANNELS.meetings.saveSummary]: {
    request: meetingTextSaveSchema,
    response: ipcResultSchema(meetingSchema),
  },
  [CHANNELS.meetings.ask]: {
    request: meetingQuestionInputSchema,
    response: ipcResultSchema(meetingQuestionAnswerSchema),
  },
  [CHANNELS.meetings.regenerateSummary]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(meetingSchema),
  },
  [CHANNELS.meetings.resume]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(meetingCaptureStateSchema),
  },
  [CHANNELS.meetings.retry]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(meetingSchema),
  },
  [CHANNELS.meetings.sync]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(meetingSchema)),
  },
  [CHANNELS.meetings.save]: {
    request: meetingSaveSchema,
    response: ipcResultSchema(meetingSchema),
  },
  [CHANNELS.meetings.delete]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.meetings.captureStart]: {
    request: z.object({ title: z.string().trim().max(200) }).strict(),
    response: ipcResultSchema(meetingCaptureStateSchema),
  },
  [CHANNELS.meetings.captureStop]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(meetingCaptureStateSchema.nullable()),
  },
  [CHANNELS.meetings.captureCancel]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.meetings.captureAppend]: {
    request: z.object({ id: nonEmptyString, audio: z.instanceof(Uint8Array).refine((audio) => audio.byteLength > 0 && audio.byteLength <= MAX_MEETING_CHUNK_BYTES) }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.meetings.captureFinish]: {
    request: z.object({ id: nonEmptyString, durationMs: z.number().finite().nonnegative(), contentType: z.string().max(100) }).strict(),
    response: ipcResultSchema(meetingSchema),
  },
  [CHANNELS.meetings.captureFail]: {
    request: z.object({ id: nonEmptyString, error: z.string().max(500) }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.meetings.importAudio]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(meetingSchema.nullable()),
  },
  [CHANNELS.meetings.exportAudio]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.metrics.get]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(metricsSchema),
  },
  [CHANNELS.metrics.daily]: {
    request: z.object({ from: isoDateSchema, until: isoDateSchema }).strict(),
    response: ipcResultSchema(z.array(dailyMetricSchema)),
  },
  [CHANNELS.metrics.apps]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(appMetricSchema)),
  },
  [CHANNELS.transformations.list]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(transformDefinitionSchema)),
  },
  [CHANNELS.transformations.save]: {
    request: transformDefinitionSaveSchema,
    response: ipcResultSchema(transformDefinitionSchema),
  },
  [CHANNELS.transformations.delete]: {
    request: z.object({ id: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.transformations.reset]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.array(transformDefinitionSchema)),
  },
  [CHANNELS.transformations.start]: {
    request: z.object({ definitionId: nonEmptyString.optional() }).strict(),
    response: ipcResultSchema(transformReviewSchema),
  },
  [CHANNELS.transformations.preview]: {
    request: transformationInputSchema,
    response: ipcResultSchema(transformationResultSchema),
  },
  [CHANNELS.transformations.view]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(transformReviewSchema.nullable()),
  },
  [CHANNELS.transformations.generate]: {
    request: z.object({ sessionId: nonEmptyString }).strict(),
    response: ipcResultSchema(transformReviewSchema),
  },
  [CHANNELS.transformations.accept]: {
    request: z.object({ sessionId: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.transformations.reject]: {
    request: z.object({ sessionId: nonEmptyString }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.transformations.runQuick]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.account.save]: {
    request: z.object({
      displayName: z.string().trim().min(1).max(200).optional(),
      firstName: z.string().trim().min(1).max(200).nullable().optional(),
      lastName: z.string().trim().min(1).max(200).nullable().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, 'At least one profile field is required'),
    response: ipcResultSchema(userSchema),
  },
  [CHANNELS.account.delete]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(authStateSchema),
  },
  [CHANNELS.dataSync.run]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.object({ changes: z.number().int().nonnegative() }).strict()),
  },
  [CHANNELS.localData.erase]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.window.minimize]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.window.maximize]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(windowStateSchema),
  },
  [CHANNELS.window.close]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.window.showHub]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.window.openScratchpad]: {
    request: z.object({ noteId: nonEmptyString.optional() }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.clipboard.copy]: {
    request: z.object({ text: z.string() }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.diagnostics.export]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(diagnosticsExportSchema),
  },
  [CHANNELS.diagnostics.open]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(z.undefined()),
  },
  [CHANNELS.updates.check]: {
    request: emptyRequestSchema,
    response: ipcResultSchema(updateStatusSchema),
  },
  [CHANNELS.updates.open]: {
    request: z.object({ target: z.enum(['download', 'release']) }).strict(),
    response: ipcResultSchema(z.undefined()),
  },
} as const satisfies Record<string, IpcRuntimeSpec>

/** Validates every payload sent from the main process to renderer subscribers. */
export const EVENT_RUNTIME_SPECS = {
  [CHANNELS.events.state]: { payload: bootstrapStateSchema },
  [CHANNELS.events.shortcutAction]: { payload: z.enum(['transform', 'transformView', 'startMeeting']) },
  [CHANNELS.events.recordingCommand]: { payload: recordingCommandSchema },
  [CHANNELS.events.recordingMeter]: { payload: recordingMeterSchema },
  [CHANNELS.events.historyChanged]: { payload: z.undefined() },
  [CHANNELS.events.notesChanged]: { payload: z.undefined() },
  [CHANNELS.events.meetingCaptureCommand]: { payload: meetingCaptureCommandSchema },
  [CHANNELS.events.meetingsChanged]: { payload: z.undefined() },
  [CHANNELS.events.transformReview]: { payload: transformReviewSchema },
  [CHANNELS.events.localServerChanged]: { payload: localServerStatusSchema },
} as const satisfies Record<string, EventRuntimeSpec>

/** Represents a renderer-to-main request channel. */
export type RequestChannel = keyof typeof IPC_RUNTIME_SPECS

/** Represents a main-to-renderer event channel. */
export type EventChannel = keyof typeof EVENT_RUNTIME_SPECS

/** Infers a validated payload for a particular request channel. */
export type IpcRequestPayload<C extends RequestChannel> = z.input<
  (typeof IPC_RUNTIME_SPECS)[C]['request']
>

/** Infers the validated result envelope for a particular request channel. */
export type IpcResponse<C extends RequestChannel> = z.output<
  (typeof IPC_RUNTIME_SPECS)[C]['response']
>

/** Infers the validated payload for a particular main-to-renderer event. */
export type EventPayload<C extends EventChannel> = z.output<
  (typeof EVENT_RUNTIME_SPECS)[C]['payload']
>
