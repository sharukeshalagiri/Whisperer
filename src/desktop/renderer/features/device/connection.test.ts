import { describe, expect, it } from 'vitest'

import type { LocalServerStatus, PublicSettings } from '../../../shared/contracts'
import { ON_DEVICE_SPEECH_MODELS } from '../../../shared/contracts'
import {
  backendChanged,
  canEnterHub,
  connectionIndicator,
  connectionToggle,
  DEFAULT_SPEECH_MODEL,
  describeProgress,
  IDLE_LOCAL_SERVER,
  inferenceReady,
  isCatalogSpeechModel,
  llmInput,
  planBootstrap,
  localServerActions,
  redactLogLine,
  settingsSectionFromHash,
  speechDestination,
  speechDraft,
  speechDraftDirty,
  speechDraftError,
  speechInput,
} from './connection'

/** Minimal settings carrying only the fields these helpers read. */
function settings(partial: Partial<PublicSettings>): PublicSettings {
  return { apiHost: null, authenticated: false, ...partial } as PublicSettings
}

function status(partial: Partial<LocalServerStatus>): LocalServerStatus {
  return { ...IDLE_LOCAL_SERVER, ...partial }
}

describe('connection gate', () => {
  it('opens the hub in device mode without a session and keeps remote mode signed-in only', () => {
    expect(canEnterHub(settings({ connectionMode: 'device', authenticated: false }))).toBe(true)
    expect(canEnterHub(settings({ connectionMode: 'remote', authenticated: false }))).toBe(false)
    expect(canEnterHub(settings({ authenticated: true }))).toBe(true)
  })
})

describe('sidebar indicator', () => {
  it('names the remote host only, never the path or credentials', () => {
    expect(connectionIndicator(settings({ apiHost: 'https://u:p@whisperer.example.com/api' }))).toEqual({
      kind: 'cloud',
      label: 'Cloud · whisperer.example.com',
    })
  })

  it('says "On this device" and never claims to be offline', () => {
    const model = connectionIndicator(settings({ connectionMode: 'device', apiHost: 'http://127.0.0.1:5000' }))
    expect(model).toEqual({ kind: 'device', label: 'On this device' })
    expect(model.label).not.toMatch(/offline/i)
  })
})

describe('local server actions', () => {
  it('offers setup only as an explicit action when nothing is installed', () => {
    expect(localServerActions(status({ state: 'notInstalled' }))).toEqual([{ id: 'setup', label: 'Set up on-device mode' }])
  })

  it('offers cancel while installing and retry after a failure', () => {
    expect(localServerActions(status({ state: 'installing' })).map((a) => a.id)).toEqual(['cancel'])
    expect(localServerActions(status({ state: 'failed', canRetry: true }))).toEqual([{ id: 'restart', label: 'Retry' }])
    expect(localServerActions(status({ state: 'failed', canRetry: false }))).toEqual([{ id: 'setup', label: 'Retry setup' }])
  })
})

describe('progress', () => {
  it('reports real bytes and never invents a total', () => {
    expect(describeProgress({ completedBytes: 1536, totalBytes: null })).toBe('1.5 KB downloaded')
    expect(describeProgress({ completedBytes: 50 * 1024 * 1024, totalBytes: 640 * 1024 * 1024 })).toBe('50 MB of 640 MB')
  })

  it('needs speech ready and the language model ready or off', () => {
    const ready = status({ state: 'ready', speech: { ...IDLE_LOCAL_SERVER.speech, status: 'ready' }, llm: { ...IDLE_LOCAL_SERVER.llm, status: 'off' } })
    expect(inferenceReady(ready)).toBe(true)
    expect(inferenceReady({ ...ready, speech: { ...ready.speech, status: 'missing' } })).toBe(false)
    expect(inferenceReady({ ...ready, llm: { ...ready.llm, status: 'failed' } })).toBe(false)
    expect(inferenceReady({ ...ready, state: 'starting' })).toBe(false)
  })
})

describe('inference drafts', () => {
  it('uses the exact catalog id by default', () => {
    expect(DEFAULT_SPEECH_MODEL).toBe('istupakov/parakeet-tdt-0.6b-v3-onnx')
    expect(speechInput(speechDraft({ provider: 'onnx', model: DEFAULT_SPEECH_MODEL }))).toEqual({ provider: 'onnx', model: DEFAULT_SPEECH_MODEL })
  })

  it('accepts only pinned catalog ids, never arbitrary owner/name repos', () => {
    const draft = speechDraft({ provider: 'onnx', model: DEFAULT_SPEECH_MODEL })
    for (const model of ON_DEVICE_SPEECH_MODELS) expect(speechDraftError({ ...draft, onnxModel: model.id })).toBeNull()
    expect(speechDraftError({ ...draft, onnxModel: 'owner/name' })).toMatch(/supported/)
    expect(speechDraftError({ ...draft, onnxModel: '' })).toMatch(/supported/)
    expect(isCatalogSpeechModel('owner/name')).toBe(false)
  })

  it('never loads a saved key and only sends one when typed or removed', () => {
    const draft = speechDraft({ provider: 'http', baseUrl: 'https://x.example/v1', model: 'whisper-1', hasApiKey: true })
    expect(draft.endpoint.apiKey).toBe('')
    expect(speechDraftDirty(draft, { provider: 'http', baseUrl: 'https://x.example/v1', model: 'whisper-1', hasApiKey: true })).toBe(false)
    expect(speechInput(draft)).toEqual({ provider: 'http', baseUrl: 'https://x.example/v1', model: 'whisper-1' })
    expect(speechInput({ ...draft, endpoint: { ...draft.endpoint, apiKey: 'new' } })).toMatchObject({ apiKey: 'new' })
    expect(speechInput({ ...draft, endpoint: { ...draft.endpoint, removeKey: true } })).toMatchObject({ apiKey: '' })
    expect(llmInput({ provider: 'off', endpoint: draft.endpoint })).toEqual({ provider: 'off' })
  })

  it('rejects endpoint URLs carrying credentials, queries or other schemes', () => {
    const draft = speechDraft({ provider: 'http', baseUrl: '', model: 'm', hasApiKey: false })
    const withUrl = (baseUrl: string) => speechDraftError({ ...draft, endpoint: { ...draft.endpoint, baseUrl } })
    expect(withUrl('https://key@x.example/v1')).toMatch(/API key/)
    expect(withUrl('https://x.example/v1?key=1')).toMatch(/query/)
    expect(withUrl('ftp://x.example')).toMatch(/http/)
    expect(withUrl('http://localhost:11434/v1')).toBeNull()
  })
})

describe('privacy copy', () => {
  it('is honest that an HTTP speech endpoint receives audio even in device mode', () => {
    const copy = speechDestination(
      settings({ connectionMode: 'device', inference: { speech: { provider: 'http', baseUrl: 'https://asr.example.com/v1', model: 'm', hasApiKey: false }, llm: { provider: 'off' } } }),
    )
    expect(copy).toContain('asr.example.com')
    expect(copy).not.toMatch(/offline|never leaves/i)
  })
})

describe('activity log', () => {
  it('redacts key-shaped text as a second line of defence', () => {
    expect(redactLogLine('Authorization: Bearer abc.def')).not.toContain('abc.def')
    expect(redactLogLine('api_key=sk-1234567890abcdef')).not.toContain('1234567890abcdef')
    expect(redactLogLine('GET https://user:pass@host/x')).not.toContain('pass')
    expect(redactLogLine('x'.repeat(400))).toHaveLength(300)
  })
})

describe('settings routes', () => {
  it('opens the inference section from the sidebar indicator link', () => {
    expect(settingsSectionFromHash('#/settings?section=inference')).toBe('inference')
    expect(settingsSectionFromHash('#/settings?section=unknown')).toBe('general')
  })
})

describe('connection toggle', () => {
  it('flips freely when a remote session and the on-device runtime both exist', () => {
    const cloud = connectionToggle(settings({ connectionMode: 'remote', authenticated: true, apiHost: 'https://w.example.com', runtimeInstalled: true }))
    expect(cloud).toEqual({ mode: 'remote', enabled: true, tooltip: 'Cloud · w.example.com · switch to this device' })
    const device = connectionToggle(settings({ connectionMode: 'device', authenticated: true, runtimeInstalled: true }))
    expect(device).toEqual({ mode: 'device', enabled: true, tooltip: 'On this device · switch to cloud' })
  })

  it('rests on this device, disabled, for someone who never signed in', () => {
    const toggle = connectionToggle(settings({ connectionMode: 'device', authenticated: false, runtimeInstalled: true }))
    expect(toggle.mode).toBe('device')
    expect(toggle.enabled).toBe(false)
    expect(toggle.tooltip).toMatch(/sign in/i)
  })

  it('rests on cloud, disabled, until on-device inference is set up', () => {
    const toggle = connectionToggle(settings({ connectionMode: 'remote', authenticated: true, apiHost: 'https://w.example.com', runtimeInstalled: false }))
    expect(toggle.mode).toBe('remote')
    expect(toggle.enabled).toBe(false)
    expect(toggle.tooltip).toMatch(/set up on-device inference/i)
  })

  it('treats a missing runtimeInstalled field from an older main as not installed', () => {
    expect(connectionToggle(settings({ connectionMode: 'remote', authenticated: true })).enabled).toBe(false)
  })
})

describe('backend change', () => {
  it('is a change only when the hub stays open and the active backend differs', () => {
    const cloud = settings({ connectionMode: 'remote', authenticated: true })
    const device = settings({ connectionMode: 'device', authenticated: true })
    expect(backendChanged(cloud, device)).toBe(true)
    expect(backendChanged(device, cloud)).toBe(true)
    expect(backendChanged(cloud, settings({ connectionMode: 'remote', authenticated: true, apiHost: 'https://a.example' }))).toBe(false)
    expect(backendChanged(null, device)).toBe(false)
  })

  it('is not a change when the hub closes, since the sign-in screen replaces the shell', () => {
    const device = settings({ connectionMode: 'device', authenticated: false })
    expect(backendChanged(device, settings({ connectionMode: 'remote', authenticated: false }))).toBe(false)
  })
})

describe('bootstrap plan', () => {
  const cloud = settings({ connectionMode: 'remote', authenticated: true })
  const device = settings({ connectionMode: 'device', authenticated: true })
  const signedOut = settings({ connectionMode: 'remote', authenticated: false })

  it('stages a crossing and commits everything else at once', () => {
    expect(planBootstrap(cloud, false, device, false)).toBe('stage')
    expect(planBootstrap(cloud, false, cloud, false)).toBe('commit')
    expect(planBootstrap(null, false, device, false)).toBe('commit')
  })

  it('lets the newest state replace a staged one, even one that flips back', () => {
    expect(planBootstrap(cloud, true, device, false)).toBe('stage')
    expect(planBootstrap(cloud, true, cloud, false)).toBe('restage')
  })

  it('cancels the animation for reduced motion and for any state that leaves the hub', () => {
    expect(planBootstrap(cloud, false, device, true)).toBe('cancel')
    expect(planBootstrap(cloud, true, cloud, true)).toBe('cancel')
    expect(planBootstrap(device, true, signedOut, false)).toBe('cancel')
  })
})
