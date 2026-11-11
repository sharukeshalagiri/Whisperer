import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { BootstrapState, Capabilities } from '../../../shared/contracts'
import { defaultShortcutBindings } from '../../../shared/shortcuts'
import { DeviceSetupLayout } from './DeviceSetupLayout'
import { OnboardingScreen } from './OnboardingScreen'
import { SignInScreen } from './SignInScreen'

vi.mock('../recording/RecorderProvider', () => ({
  useRecorder: () => ({ phase: 'idle', level: 0, audioBytes: 44, error: null, result: null }),
}))

/** Supplies a renderer-safe setup state with no server or microphone activity. */
function setupState(required: boolean): BootstrapState {
  const capability = { supported: required, granted: false, reason: null }
  const capabilities: Capabilities = {
    microphone: capability,
    accessibility: capability,
    automation: capability,
    globalShortcut: capability,
    autoPaste: capability,
    holdToTalk: capability,
    systemAudio: capability,
  }
  return {
    settings: {
      apiHost: 'https://whisperer.example.test',
      authenticated: true,
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
    },
    capabilities,
    user: { id: 'fixture', email: null, displayName: 'Fixture' },
    platform: 'linux',
    version: '0.1.0',
    recording: { status: 'idle', capturePhase: 'idle', startedAt: null, error: null },
    meetingCapture: null,
    transform: null,
    quickTransform: null,
    overlayDockEdge: 'bottom',
    updates: { currentVersion: '0.1.0', checking: false, checkedAt: null, update: null, error: null },
    signInCode: null,
  }
}

/** Pins the device-only presentation and initial gates; the Electron driver exercises live transitions. */
describe('device setup presentation', () => {
  it('shares four progress sections without a survey or personalization gate', () => {
    const html = renderToStaticMarkup(
      createElement(DeviceSetupLayout, {
        section: 2,
        right: createElement('aside', null, 'Device'),
        children: createElement('section', null, 'Setup'),
      }),
    )
    expect(html).toContain('aria-current="step">Set up')
    expect(html).toContain('--setup-progress:75%')
    expect(html).not.toMatch(/Personalize|Survey|Trial/)
  })

  it('requires a server URL and disables empty sign-in without saving locally', () => {
    const html = renderToStaticMarkup(
      createElement(SignInScreen, { onComplete: async () => undefined }),
    )
    expect(html).toContain('Whisperer server URL')
    expect(html).toContain('type="url"')
    expect(html).toContain('required=""')
    expect(html).toContain('type="submit" disabled=""')
    expect(html).toContain('Sign in via browser')
    expect(html).not.toContain('Stop typing')
    expect(html).not.toContain('sign-in-brand__pagination')
  })

  it('starts with permissions and blocks advancement only for supported denied access', () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingScreen, {
        state: setupState(true),
        onComplete: async () => undefined,
      }),
    )
    expect(html).toContain('Give Whisperer permissions on your computer')
    expect(html).toContain('Allow microphone')
    expect(html).toContain('Allow input access')
    expect(html).toMatch(/disabled="">Continue/)
    expect(html).not.toContain('onboarding-shortcut')
  })

  it('resolves unsupported permissions without waiting for nonexistent services', () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingScreen, {
        state: setupState(false),
        onComplete: async () => undefined,
      }),
    )
    expect(html).toContain('Thanks for trusting us, we value your privacy')
    expect(html).toContain('Not required')
    expect(html).not.toMatch(/disabled="">Continue/)
    expect(html).not.toContain('data-theme="light"')
  })
})
