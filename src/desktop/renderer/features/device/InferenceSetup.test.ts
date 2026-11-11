import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { BootstrapState, Capabilities, LocalServerStatus, PublicSettings } from '../../../shared/contracts'
import { ON_DEVICE_SPEECH_MODELS } from '../../../shared/contracts'
import { defaultShortcutBindings } from '../../../shared/shortcuts'
import { ConnectionIndicator, ConnectionToggle } from '../../App'
import { IDLE_LOCAL_SERVER } from './connection'
import { InferenceForm, LocalServerPanel } from './InferenceSetup'
import { OnboardingScreen } from './OnboardingScreen'
import { ConfirmEraseLocalData, SettingsScreen } from './SettingsScreen'
import { SignInScreen } from './SignInScreen'

vi.mock('../recording/RecorderProvider', () => ({
  useRecorder: () => ({ phase: 'idle', level: 0, audioBytes: 44, error: null, result: null }),
}))

const SECRET = 'sk-test-SECRET-VALUE-1234567890'

/** Builds renderer-safe state for one connection mode and server status. */
function state(partial: Partial<PublicSettings>, server: Partial<LocalServerStatus> = {}): BootstrapState {
  const capability = { supported: false, granted: false, reason: null }
  const capabilities = Object.fromEntries(
    ['microphone', 'accessibility', 'automation', 'globalShortcut', 'autoPaste', 'holdToTalk', 'systemAudio'].map((id) => [id, capability]),
  ) as unknown as Capabilities
  return {
    settings: {
      apiHost: null,
      authenticated: false,
      secureCredentials: true,
      language: 'en',
      polish: false,
      autoPaste: false,
      shortcut: 'Control+Alt',
      shortcutBindings: defaultShortcutBindings('linux'),
      microphoneId: null,
      onboardingCompleted: false,
      launchAtLogin: false,
      theme: 'dark',
      retainAudio: false,
      holdToTalk: false,
      showStatusBar: false,
      scratchpadInBar: false,
      scratchpadShortcut: '',
      transformsEnabled: true,
      autoAfterDictationTransform: { active: false, definitionId: 'polish' },
      connectionMode: 'device',
      localServer: { ...IDLE_LOCAL_SERVER, ...server },
      inference: { speech: { provider: 'onnx', model: 'istupakov/parakeet-tdt-0.6b-v3-onnx' }, llm: { provider: 'off' } },
      ...partial,
    },
    capabilities,
    user: { id: 'device', email: null, displayName: 'This device' },
    platform: 'linux',
    version: '0.1.0',
    recording: { status: 'idle', capturePhase: 'idle', startedAt: null, error: null },
    meetingCapture: null,
    transform: null,
    quickTransform: null,
    overlayDockEdge: 'bottom',
    updates: { currentVersion: '0.1.0', checking: false, checkedAt: null, update: null, error: null },
  }
}

function panel(server: Partial<LocalServerStatus>, settingsPartial: Partial<PublicSettings> = {}): string {
  const s = state(settingsPartial, server)
  return renderToStaticMarkup(
    createElement(LocalServerPanel, { settings: s.settings, status: s.settings.localServer!, variant: 'settings' }),
  )
}

describe('start screen', () => {
  it('offers continuing without signing in, beside the unchanged sign-in form', () => {
    const html = renderToStaticMarkup(createElement(SignInScreen, { onComplete: async () => undefined }))
    expect(html).toContain('Sign in via browser')
    expect(html).toContain('Continue without signing in')
    expect(html).not.toMatch(/fully offline|fully locally/i)
  })
})

describe('onboarding inference step', () => {
  it('opens on the inference choice in device mode with Continue locked until ready', () => {
    const html = renderToStaticMarkup(createElement(OnboardingScreen, { state: state({}), onComplete: async () => undefined }))
    expect(html).toContain('aria-current="step">Inference')
    expect(html).toContain('Choose how Whisperer processes speech')
    expect(html).toContain('Set up on-device mode')
    expect(html).toContain('Nothing downloads until you choose it')
    expect(html).toMatch(/disabled="">Continue/)
    expect(html).toContain('Sign in to a server instead')
  })

  it('keeps the signed-in rail and permissions first in remote mode', () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingScreen, { state: state({ connectionMode: 'remote', authenticated: true }), onComplete: async () => undefined }),
    )
    expect(html).toContain('<li class="is-current">Sign in')
    expect(html).toContain('aria-current="step">Permissions')
    expect(html).not.toContain('>Inference<')
    expect(html).not.toContain('Choose how Whisperer processes speech')
  })

  it('unlocks Continue once speech is ready and the language model is off', () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingScreen, {
        state: state({}, { state: 'ready', port: 5123, speech: { status: 'ready', model: 'istupakov/parakeet-tdt-0.6b-v3-onnx', message: null, progress: null }, llm: { status: 'off', model: null, message: null } }),
        onComplete: async () => undefined,
      }),
    )
    expect(html).toContain('Speech is ready.')
    expect(html).not.toMatch(/disabled="">Continue/)
  })
})

describe('local server panel', () => {
  it('shows install progress in real bytes with Cancel', () => {
    const html = panel({ state: 'installing', stage: 'uv', message: 'Downloading uv 0.13.1…', progress: { completedBytes: 1048576, totalBytes: 20971520 } })
    expect(html).toContain('Installing')
    expect(html).toContain('Downloading uv 0.13.1…')
    expect(html).toContain('1.0 MB of 20 MB')
    expect(html).toContain('>Cancel<')
    expect(html).not.toContain('Set up on-device mode')
  })

  it('shows an unknown total without a percentage', () => {
    const html = panel({ state: 'installing', progress: { completedBytes: 2048, totalBytes: null } })
    expect(html).toContain('2.0 KB downloaded')
    expect(html).not.toContain('%')
  })

  it('names the failure honestly and offers Retry', () => {
    const html = panel({ state: 'failed', stage: 'uv', canRetry: true, message: 'Runtime download failed (uv): network error. Retry.' })
    expect(html).toContain('Failed')
    expect(html).toContain('Runtime download failed (uv): network error. Retry.')
    expect(html).toContain('>Retry<')
  })

  it('offers an explicit model download for a missing model and names the exact id', () => {
    const html = panel({ state: 'ready', port: 5123, speech: { status: 'missing', model: 'istupakov/parakeet-tdt-0.6b-v3-onnx', message: null, progress: null } })
    expect(html).toContain('Model not downloaded')
    expect(html).toContain('Download model')
    expect(html).toContain('istupakov/parakeet-tdt-0.6b-v3-onnx')
    expect(html).toContain('127.0.0.1:5123')
  })

  it('collapses the activity log and keeps secrets out of it', () => {
    const html = panel({ state: 'failed', log: ['Starting', `Authorization: Bearer ${SECRET}`, `api_key=${SECRET}`] })
    expect(html).toContain('<details')
    expect(html).not.toContain('<details open')
    expect(html).toContain('Activity (3)')
    expect(html).not.toContain(SECRET)
  })

  it('has no Docker controls', () => {
    expect(panel({ state: 'notInstalled' })).not.toMatch(/docker/i)
  })
})

describe('inference form', () => {
  it('offers only the pinned catalog with full ids and states that other models and import are unavailable', () => {
    const s = state({})
    const html = renderToStaticMarkup(createElement(InferenceForm, { settings: s.settings, status: s.settings.localServer!, variant: 'settings' }))
    for (const model of ON_DEVICE_SPEECH_MODELS) expect(html).toContain(`value="${model.id}"`)
    expect(html).toContain('Parakeet TDT 0.6B v3 (istupakov/parakeet-tdt-0.6b-v3-onnx)')
    expect(html.match(/<option /g)).toHaveLength(ON_DEVICE_SPEECH_MODELS.length)
    expect(html).not.toMatch(/Custom Hugging Face|Hugging Face repo id/)
    expect(html).toContain('Other Hugging Face models and importing model files from disk are not available.')
    expect(html).toContain('Start the on-device server to test.')
  })

  it('flags a saved model outside the catalog instead of offering it', () => {
    const s = state({ inference: { speech: { provider: 'onnx', model: 'someone/custom-asr' }, llm: { provider: 'off' } } })
    const html = renderToStaticMarkup(createElement(InferenceForm, { settings: s.settings, status: s.settings.localServer!, variant: 'settings' }))
    expect(html).toMatch(/<option disabled="" value="someone\/custom-asr"[^>]*>someone\/custom-asr \(not supported\)<\/option>/)
    expect(html).toContain('The saved model is not supported by the server on this device.')
  })

  it('never renders a saved key and states the key is kept', () => {
    const s = state({
      inference: {
        speech: { provider: 'http', baseUrl: 'https://asr.example.com/v1', model: 'whisper-1', hasApiKey: true },
        llm: { provider: 'http', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', hasApiKey: false },
      },
    })
    const html = renderToStaticMarkup(createElement(InferenceForm, { settings: s.settings, status: s.settings.localServer!, variant: 'settings' }))
    expect(html).toContain('type="password"')
    expect(html).toContain('Saved key kept')
    expect(html).toContain('Remove the saved key')
    expect(html).toContain('Optional. Leave empty if the endpoint needs no key.')
    expect(html).not.toMatch(/value="[^"]*(sk-|•)/)
  })

  it('explains that language model off disables transforms', () => {
    const s = state({})
    const html = renderToStaticMarkup(createElement(InferenceForm, { settings: s.settings, status: s.settings.localServer!, variant: 'setup' }))
    expect(html).toContain('Polish and text transforms are unavailable while the language model is off.')
  })
})

describe('settings', () => {
  it('shows the inference section and server status in device mode', () => {
    const html = renderToStaticMarkup(createElement(SettingsScreen, { state: state({}), onRefresh: async () => undefined, initialSection: 'inference' }))
    expect(html).toContain('>Inference<')
    expect(html).toContain('On-device server')
    expect(html).toContain('Speech recognition')
  })

  it('offers switching back to a server from Account in device mode, without remote account actions', () => {
    const html = renderToStaticMarkup(createElement(SettingsScreen, { state: state({}), onRefresh: async () => undefined, initialSection: 'account' }))
    expect(html).toContain('Running on this device')
    expect(html).toContain('Sign in to a server instead')
    expect(html).not.toContain('Delete account')
  })

  it('offers using this device from remote Account and leaves server inference to the server', () => {
    const remote = state({ connectionMode: 'remote', authenticated: true, apiHost: 'https://whisperer.example.com' })
    const account = renderToStaticMarkup(createElement(SettingsScreen, { state: remote, onRefresh: async () => undefined, initialSection: 'account' }))
    expect(account).toContain('Use this device instead')
    expect(account).toContain('https://whisperer.example.com')
    const inference = renderToStaticMarkup(createElement(SettingsScreen, { state: remote, onRefresh: async () => undefined, initialSection: 'inference' }))
    expect(inference).toContain('whisperer.example.com chooses')
    expect(inference).not.toContain('Speech recognition')
  })

  it('offers deleting on-device data only in device mode', () => {
    const device = renderToStaticMarkup(createElement(SettingsScreen, { state: state({}), onRefresh: async () => undefined, initialSection: 'privacy' }))
    expect(device).toContain('Delete on-device data')
    expect(device).toContain('Downloaded models and settings stay.')
    const remote = state({ connectionMode: 'remote', authenticated: true, apiHost: 'https://whisperer.example.com' })
    const privacy = renderToStaticMarkup(createElement(SettingsScreen, { state: remote, onRefresh: async () => undefined, initialSection: 'privacy' }))
    expect(privacy).not.toContain('Delete on-device data')
  })

  it('keeps the permanent delete disabled until the confirmation word is typed', () => {
    const html = renderToStaticMarkup(createElement(ConfirmEraseLocalData, { busy: false, onCancel: () => undefined, onConfirm: () => undefined }))
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Type DELETE to confirm')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Delete permanently<\/button>/)
    expect(html).toContain('This cannot be undone.')
  })
})

describe('sidebar connection indicator', () => {
  it('uses a cloud icon and host tooltip for a remote server', () => {
    const html = renderToStaticMarkup(createElement(ConnectionIndicator, { state: state({ connectionMode: 'remote', authenticated: true, apiHost: 'https://whisperer.example.com/' }) }))
    expect(html).toContain('data-connection="cloud"')
    expect(html).toContain('aria-label="Cloud · whisperer.example.com"')
    expect(html).toContain('lucide-cloud')
  })

  it('uses a laptop icon and "On this device" without claiming offline', () => {
    const html = renderToStaticMarkup(createElement(ConnectionIndicator, { state: state({}) }))
    expect(html).toContain('data-connection="device"')
    expect(html).toContain('aria-label="On this device"')
    expect(html).toContain('lucide-laptop')
    expect(html).not.toMatch(/offline/i)
  })
})

describe('ConnectionToggle', () => {
  const refresh = async (): Promise<void> => {}

  it('is an enabled switch resting on cloud when both backends are usable', () => {
    const html = renderToStaticMarkup(createElement(ConnectionToggle, { onRefresh: refresh, state: state({ connectionMode: 'remote', authenticated: true, apiHost: 'https://whisperer.example.com/', runtimeInstalled: true }) }))
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('aria-disabled="false"')
    expect(html).toContain('Cloud · whisperer.example.com · switch to this device')
    expect(html).toContain('lucide-cloud')
    expect(html).toContain('lucide-laptop')
  })

  it('rests on this device and is disabled for a user who never signed in, telling them why', () => {
    const html = renderToStaticMarkup(createElement(ConnectionToggle, { onRefresh: refresh, state: state({ connectionMode: 'device', authenticated: false, runtimeInstalled: true }) }))
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('sign in to a server to enable cloud')
  })

  it('rests on cloud and is disabled until on-device inference is set up', () => {
    const html = renderToStaticMarkup(createElement(ConnectionToggle, { onRefresh: refresh, state: state({ connectionMode: 'remote', authenticated: true, apiHost: 'https://whisperer.example.com/', runtimeInstalled: false }) }))
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('set up on-device inference in Settings')
    expect(html).not.toMatch(/offline/i)
  })
})
