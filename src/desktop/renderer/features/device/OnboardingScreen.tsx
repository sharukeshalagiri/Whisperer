import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { ArrowLeft, Check, Mic, Keyboard, Languages } from 'lucide-react'

import type { BootstrapState, CapabilityId } from '../../../shared/contracts'
import { migrateShortcutBindings, normalizeShortcut } from '../../../shared/shortcuts'
import { useRecorder } from '../recording/RecorderProvider'
import { TutorialRecorder } from '../recording/TutorialRecorder'
import { DEVICE_SECTIONS, inferenceReady, isDeviceMode } from './connection'
import { DeviceSetupLayout } from './DeviceSetupLayout'
import { InferenceForm, LocalServerPanel } from './InferenceSetup'
import { useLocalServer } from './useLocalServer'
import { canContinuePermissions, confirmedMicrophonePermission, confirmMicrophoneAccess } from './onboardingPermissions'
import { ShortcutChips, ShortcutRecorder } from './ShortcutRecorder'
import { shortcutKeys, useShortcutKeyTest } from './shortcut-keys'
import {
  listPermissions,
  messageFromError,
  readCapabilities,
  readSettings,
  requestPermission,
  updateDeviceSettings,
} from './deviceApi'

export interface OnboardingScreenProps {
  /** Current device bootstrap data, used only for local settings and capabilities. */
  state: BootstrapState
  /** Refreshes bootstrap state after local setup finishes. */
  onComplete: () => Promise<void>
}

interface InputDevice {
  deviceId: string
  label: string
}

const languages = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['pt', 'Portuguese'],
] as const
const progressSections = [1, 2, 2, 2, 3]

/** Configures only this device, reusing the hub recorder and the shared shortcut editor. */
export function OnboardingScreen({ state, onComplete }: OnboardingScreenProps): ReactElement {
  const settings = readSettings(state)
  const recorder = useRecorder()
  const deviceMode = isDeviceMode(settings)
  const localServer = useLocalServer(settings)
  // Device mode opens on the inference choice; the device steps that follow are unchanged.
  const [choosingInference, setChoosingInference] = useState(deviceMode)
  const [step, setStep] = useState(0)
  const [microphones, setMicrophones] = useState<InputDevice[]>([])
  const [microphoneId, setMicrophoneId] = useState(settings.microphoneId ?? 'default')
  const [language, setLanguage] = useState(settings.language ?? 'en')
  const [bindings, setBindings] = useState(() => migrateShortcutBindings(settings, state.platform))
  const [nativePermissions, setPermissions] = useState(() => readCapabilities(state))
  // Linux reports microphone access as unknown; this records a real probe for this setup session only.
  const [microphoneConfirmed, setMicrophoneConfirmed] = useState(false)
  const permissions = {
    ...nativePermissions,
    microphone: confirmedMicrophonePermission(nativePermissions.microphone, microphoneConfirmed),
  }
  const [message, setMessage] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [showMicrophones, setShowMicrophones] = useState(false)
  const [editingShortcuts, setEditingShortcuts] = useState(false)
  const [shortcutTested, setShortcutTested] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const microphoneName =
    microphones.find((input) => input.deviceId === microphoneId)?.label ?? 'System default'
  const holdSupported = permissions.holdToTalk.supported
  const toggleSupported = permissions.globalShortcut.supported
  const holdShortcut = bindings.holdToTalk[0] ?? ''
  const toggleShortcut = bindings.toggleRecording[0] ?? ''
  // Push to talk is the reference test key; hands-free is the honest fallback where holding is unsupported.
  const testShortcut =
    holdSupported && holdShortcut ? holdShortcut : toggleSupported ? toggleShortcut : ''
  const pressedShortcut = useShortcutKeyTest(
    step === 3 && !editingShortcuts && Boolean(testShortcut),
    state.platform,
  )
  const pressedKeys = pressedShortcut ? shortcutKeys(pressedShortcut, state.platform) : []
  const testKeys = shortcutKeys(testShortcut, state.platform)
  const permissionsReady = canContinuePermissions(permissions.microphone)
  const insertionReady = !permissions.accessibility.supported || permissions.accessibility.granted
  const microphoneUnavailable = !permissions.microphone.supported
  const microphoneTesting = recorder.phase === 'recording'
  const microphoneBusy =
    recorder.phase === 'starting' ||
    recorder.phase === 'stopping' ||
    recorder.phase === 'processing'

  const listMicrophones = useCallback(async (): Promise<void> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }))
      setMicrophones(inputs)
      setMicrophoneId((current) =>
        current === 'default' || inputs.some((input) => input.deviceId === current)
          ? current
          : 'default',
      )
    } catch {
      setMessage('We could not list microphones on this device.')
    }
  }, [])

  const refreshPermissions = useCallback(async (): Promise<void> => {
    try {
      setPermissions(await listPermissions())
    } catch (error) {
      setMessage(messageFromError(error, 'We could not check permissions. Try again.'))
    }
  }, [])

  useEffect(() => {
    void refreshPermissions()
  }, [refreshPermissions])
  useEffect(() => {
    titleRef.current?.focus()
  }, [step, choosingInference])
  useEffect(() => {
    if (message) errorRef.current?.focus()
  }, [message])
  useEffect(() => {
    if (
      pressedShortcut &&
      normalizeShortcut(pressedShortcut, state.platform) ===
        normalizeShortcut(testShortcut, state.platform)
    )
      setShortcutTested(true)
  }, [pressedShortcut, state.platform, testShortcut])

  async function request(type: CapabilityId): Promise<void> {
    setMessage(undefined)
    try {
      await requestPermission(type)
      if (type === 'microphone') {
        await confirmMicrophoneAccess(
          () => navigator.mediaDevices.getUserMedia({ audio: true }),
          () => setMicrophoneConfirmed(true),
        )
        await listMicrophones()
      }
      await refreshPermissions()
    } catch (error) {
      setMessage(messageFromError(error, `We could not request ${type} permission.`))
    }
  }

  async function advance(): Promise<void> {
    setSaving(true)
    setMessage(undefined)
    try {
      if (step === 1) {
        // Confirmation discards the microphone test; only the later tutorial submits dictation.
        await recorder.cancel()
        await updateDeviceSettings({
          microphoneId: microphoneId === 'default' ? null : microphoneId,
        })
      }
      if (step === 2) await updateDeviceSettings({ language })
      if (step === 4) {
        // Cancel in main too so leaving setup cannot strand a tutorial capture.
        await window.whisperer.recording.cancel()
        await updateDeviceSettings({
          language,
          microphoneId: microphoneId === 'default' ? null : microphoneId,
          shortcutBindings: bindings,
          onboardingCompleted: true,
        })
        await onComplete()
      } else setStep(step + 1)
    } catch (error) {
      setMessage(messageFromError(error, 'We could not save device setup. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  async function back(): Promise<void> {
    if (step === 0 && deviceMode) {
      setMessage(undefined)
      setChoosingInference(true)
      return
    }
    try {
      if (step === 1 || step === 4) await recorder.cancel()
      setEditingShortcuts(false)
      setMessage(undefined)
      setStep(step - 1)
    } catch (error) {
      setMessage(messageFromError(error, 'We could not stop recording. Try again.'))
    }
  }

  async function changeMicrophone(): Promise<void> {
    try {
      await recorder.cancel()
      await listMicrophones()
      setShowMicrophones(true)
    } catch (error) {
      setMessage(messageFromError(error, 'We could not change microphones. Try again.'))
    }
  }

  async function saveShortcuts(): Promise<void> {
    setSaving(true)
    setMessage(undefined)
    try {
      // Saving activates the chosen keys before the tutorial; testing never triggers dictation.
      await updateDeviceSettings({ shortcutBindings: bindings })
      setEditingShortcuts(false)
      setShortcutTested(false)
    } catch (error) {
      setMessage(messageFromError(error, 'We could not save your shortcuts. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const titles = [
    permissionsReady && insertionReady
      ? 'Thanks for trusting us, we value your privacy'
      : 'Give Whisperer permissions on your computer',
    'Test your microphone',
    'Set the language you speak',
    'Press the keyboard shortcut to test it out',
    'Press the keyboard shortcut to use Whisperer',
  ]
  const descriptions: ReactNode[] = [
    permissionsReady && !insertionReady
      ? 'You can continue now. Until input access is allowed, Whisperer copies dictation to the clipboard instead of inserting it.'
      : 'Allow microphone and input access to dictate into the apps you use.',
    'Choose a microphone, then speak to check that Whisperer can hear you.',
    'Whisperer transcribes the language you choose. You can change it later in Settings.',
    testShortcut ? (
      <>
        We recommend the <ShortcutChips value={testShortcut} platform={state.platform} />{' '}
        {testKeys.length > 1 ? 'keys' : 'key'} at the bottom left of the keyboard.
      </>
    ) : (
      'Shortcuts are unavailable on this device. Use the recording buttons instead.'
    ),
    holdSupported && holdShortcut ? (
      <>
        Hold down on the <ShortcutChips value={holdShortcut} platform={state.platform} />, speak,
        and let go to insert spoken text.
      </>
    ) : (
      'Press your hands-free shortcut to start and stop, or use the recording buttons.'
    ),
  ]

  /** Returns to the sign-in screen. Data on this device stays in its own scope. */
  async function switchToSignIn(): Promise<void> {
    setSaving(true)
    setMessage(undefined)
    try {
      await window.whisperer.settings.setConnectionMode('remote')
      await onComplete()
    } catch (error) {
      setMessage(messageFromError(error, 'We could not switch to sign-in. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  if (choosingInference) {
    const ready = inferenceReady(localServer)
    return (
      <main className="page onboarding-page device-setup-page" aria-labelledby="onboarding-title">
        <DeviceSetupLayout
          section={1}
          sections={DEVICE_SECTIONS}
          right={
            <aside className="device-setup-right" aria-label="Inference configuration">
              <section className="device-setup-card device-inference-card">
                <InferenceForm settings={settings} status={localServer} variant="setup" />
                <LocalServerPanel settings={settings} status={localServer} variant="setup" />
              </section>
            </aside>
          }
        >
          <section className="device-setup-left">
            <div className="device-setup-left-content">
              <button
                className="device-button device-button--link device-back"
                type="button"
                onClick={() => void switchToSignIn()}
                disabled={saving}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Sign in to a server instead
              </button>
              <div className="device-setup-heading">
                <h1 id="onboarding-title" tabIndex={-1} ref={titleRef}>
                  Choose how Whisperer processes speech
                </h1>
                <p>
                  The Whisperer server runs on this device. Speech can be transcribed here or by an
                  HTTP endpoint you choose, and an endpoint receives your audio or text.
                </p>
              </div>
              {message ? (
                <p className="device-error" role="alert" ref={errorRef} tabIndex={-1}>
                  {message}
                </p>
              ) : null}
            </div>
            <footer className="device-setup-cta">
              <p className="device-hint" id="inference-continue-hint" aria-live="polite">
                {ready
                  ? 'Speech is ready.'
                  : 'Continue unlocks when the server is running, speech is ready and the language model is ready or off.'}
              </p>
              <button
                className="device-button device-button--large"
                type="button"
                aria-describedby="inference-continue-hint"
                disabled={!ready}
                onClick={() => {
                  setMessage(undefined)
                  setChoosingInference(false)
                }}
              >
                Continue
              </button>
            </footer>
          </section>
        </DeviceSetupLayout>
      </main>
    )
  }

  const right = (
    <aside
      className={`device-setup-right${step === 4 ? ' device-setup-right--tutorial' : ''}`}
      aria-label="Device configuration"
    >
      <section className={`device-setup-card${step === 4 ? ' device-tutorial-card' : ''}`}>
        {step === 0 ? (
          <div className="device-permissions">
            {(['microphone', 'accessibility'] as const).map((id) => {
              const capability = permissions[id]
              const resolved = !capability.supported || capability.granted
              return (
                <section className="device-permission" key={id}>
                  <span className="device-permission-icon" aria-hidden="true">
                    {id === 'microphone' ? <Mic size={22} /> : <Keyboard size={22} />}
                  </span>
                  <div>
                    <h2>
                      {id === 'microphone'
                        ? 'Allow Whisperer to use your microphone'
                        : 'Allow Whisperer to insert spoken words'}
                    </h2>
                    <p>
                      {id === 'microphone'
                        ? 'Whisperer will only access the mic when you are actively using it.'
                        : 'Insert dictated text into the app you are using.'}
                    </p>
                    {!capability.supported ? (
                      <p className="device-hint">
                        {capability.reason ??
                          'No separate permission request is required on this device.'}
                      </p>
                    ) : null}
                    {capability.supported && !capability.granted && capability.reason ? (
                      <p className="device-hint">{capability.reason}</p>
                    ) : null}
                  </div>
                  {resolved ? (
                    <span className="device-permission-status">
                      <Check size={16} aria-hidden="true" />
                      {capability.supported ? 'Allowed' : 'Not required'}
                    </span>
                  ) : (
                    <button
                      className="device-button"
                      type="button"
                      onClick={() => void request(id)}
                    >
                      {id === 'microphone'
                        ? 'Allow microphone'
                        : state.platform === 'win32'
                          ? 'Open Settings'
                          : 'Allow input access'}
                    </button>
                  )}
                </section>
              )
            })}
            {!permissionsReady || !insertionReady ? (
              <button
                className="device-button device-button--link"
                type="button"
                onClick={() => void refreshPermissions()}
              >
                Check permissions again
              </button>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <h2>Do you see purple bars while you speak?</h2>
            <div
              className="device-microphone-meter"
              role="meter"
              aria-label="Microphone input level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(recorder.level * 100)}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <i
                  key={index}
                  style={{ height: `${4 + recorder.level * (24 + (index % 4) * 8)}px` }}
                />
              ))}
            </div>
            <p className="device-hint">{microphoneName}</p>
            {showMicrophones ? (
              <label className="device-field">
                Microphone
                <select
                  className="device-input"
                  value={microphoneId}
                  onChange={(event) => setMicrophoneId(event.target.value)}
                  disabled={microphoneTesting || microphoneBusy}
                >
                  <option value="default">System default</option>
                  {microphones
                    .filter((input) => input.deviceId !== 'default')
                    .map((input) => (
                      <option key={input.deviceId} value={input.deviceId}>
                        {input.label}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {recorder.error ? (
              <p className="device-error" role="alert">
                {recorder.error}
              </p>
            ) : null}
            {microphoneUnavailable ? (
              <p className="device-hint">
                {permissions.microphone.reason ??
                  'Microphone capture is unavailable on this device.'}
              </p>
            ) : null}
            <div className="device-card-actions">
              <button
                className="device-button device-button--secondary"
                type="button"
                onClick={() => void changeMicrophone()}
                disabled={microphoneBusy}
              >
                Change microphone
              </button>
              {!microphoneTesting && !microphoneUnavailable ? (
                <button
                  className="device-button"
                  type="button"
                  onClick={() =>
                    void recorder.start({
                      microphoneId: microphoneId === 'default' ? undefined : microphoneId,
                    })
                  }
                  disabled={microphoneBusy}
                >
                  {microphoneBusy ? 'Starting…' : 'Start microphone test'}
                </button>
              ) : null}
              {microphoneTesting || microphoneUnavailable ? (
                <button
                  className="device-button"
                  type="button"
                  onClick={() => void advance()}
                  disabled={saving}
                >
                  Yes
                </button>
              ) : null}
            </div>
            <p className="device-quick-tip">
              Quick tip: speak normally, as if you were talking to a friend.
            </p>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <span className="device-card-icon" aria-hidden="true">
              <Languages size={28} />
            </span>
            <h2>Your dictation language</h2>
            <label className="device-field" htmlFor="onboarding-language">
              Language
              <select
                className="device-input"
                id="onboarding-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {languages.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="device-card-actions">
              <button
                className="device-button"
                type="button"
                disabled={saving}
                onClick={() => void advance()}
              >
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </>
        ) : null}

        {step === 3 && !editingShortcuts && testShortcut ? (
          <>
            <h2>
              {testKeys.length > 1
                ? 'Do the buttons turn purple while pressing them?'
                : 'Does the button turn purple when you press it?'}
            </h2>
            <div className="device-shortcut-test" aria-live="polite">
              <span className="shortcut-chips">
                {testKeys.map((key) => (
                  <kbd
                    className={`shortcut-chip${pressedKeys.includes(key) ? ' is-pressed' : ''}`}
                    key={key}
                  >
                    {key}
                  </kbd>
                ))}
              </span>
              <p className="device-hint">
                {shortcutTested
                  ? 'Shortcut detected.'
                  : `Press the ${testKeys.length > 1 ? 'keys' : 'key'} on your keyboard!`}
              </p>
            </div>
            <div className="device-card-actions device-card-actions--split">
              <button
                className="device-button device-button--link"
                type="button"
                onClick={() => setEditingShortcuts(true)}
              >
                Edit shortcut
              </button>
              <span>
                <button
                  className="device-button device-button--secondary"
                  type="button"
                  onClick={() => setEditingShortcuts(true)}
                >
                  No
                </button>
                <button
                  className="device-button"
                  type="button"
                  disabled={!shortcutTested || saving}
                  onClick={() => void advance()}
                >
                  Yes
                </button>
              </span>
            </div>
          </>
        ) : null}

        {step === 3 && (editingShortcuts || !testShortcut) ? (
          <>
            <h2>Shortcuts</h2>
            <p>Choose your preferred shortcuts for using Whisperer.</p>
            <div className="device-shortcut-row">
              <div>
                <h3>Push to talk</h3>
                <p>Hold to say something short.</p>
              </div>
              <ShortcutRecorder
                actionLabel="Push to talk"
                value={holdShortcut}
                platform={state.platform}
                disabled={!holdSupported || saving}
                removable={false}
                onChange={(value: string) =>
                  setBindings((current) => ({
                    ...current,
                    holdToTalk: value
                      ? [value, ...current.holdToTalk.slice(1)]
                      : current.holdToTalk,
                  }))
                }
              />
            </div>
            {!holdSupported ? (
              <p className="device-hint">
                {permissions.holdToTalk.reason ??
                  'Push to talk is not supported on this device. Use hands-free mode or the recording buttons.'}
              </p>
            ) : null}
            <div className="device-shortcut-row">
              <div>
                <h3>Hands-free mode</h3>
                <p>Dictate hands-free by pressing this shortcut to start and stop.</p>
              </div>
              <ShortcutRecorder
                actionLabel="Hands-free mode"
                value={toggleShortcut}
                platform={state.platform}
                disabled={!toggleSupported || saving}
                onChange={(value: string) =>
                  setBindings((current) => ({
                    ...current,
                    toggleRecording: value
                      ? [value, ...current.toggleRecording.slice(1)]
                      : current.toggleRecording.slice(1),
                  }))
                }
              />
            </div>
            {!toggleSupported ? (
              <p className="device-hint">
                {permissions.globalShortcut.reason ??
                  'Global shortcuts are unavailable. Use the recording buttons instead.'}
              </p>
            ) : null}
            <div className="device-card-actions">
              {testShortcut ? (
                <button
                  className="device-button"
                  type="button"
                  disabled={saving}
                  onClick={() => void saveShortcuts()}
                >
                  {saving ? 'Saving…' : 'Done'}
                </button>
              ) : (
                <button
                  className="device-button"
                  type="button"
                  disabled={saving}
                  onClick={() => void advance()}
                >
                  Continue
                </button>
              )}
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <header className="device-tutorial-title">
              <span aria-hidden="true">● ● ●</span> Try it
            </header>
            <div className="device-tutorial-body">
              {holdSupported && holdShortcut ? (
                <p className="device-tutorial-shortcut">
                  Hold <ShortcutChips value={holdShortcut} platform={state.platform} /> while you
                  speak.
                </p>
              ) : null}
              {toggleSupported && toggleShortcut ? (
                <p className="device-tutorial-shortcut">
                  Hands-free <ShortcutChips value={toggleShortcut} platform={state.platform} />
                </p>
              ) : null}
              <TutorialRecorder
                microphoneId={microphoneId === 'default' ? undefined : microphoneId}
              />
              {recorder.result?.historyEntry.text ? (
                <p className="device-tutorial-result">{recorder.result.historyEntry.text}</p>
              ) : null}
              <p className="device-hint">
                You can change every device preference later in Settings.
              </p>
            </div>
          </>
        ) : null}
      </section>
    </aside>
  )

  return (
    <main className="page onboarding-page device-setup-page" aria-labelledby="onboarding-title">
      <DeviceSetupLayout
        section={(progressSections[step] ?? 3) + (deviceMode ? 1 : 0)}
        sections={deviceMode ? DEVICE_SECTIONS : undefined}
        right={right}
      >
        <section className="device-setup-left">
          <div className="device-setup-left-content">
            {step > 0 || deviceMode ? (
              <button
                className="device-button device-button--link device-back"
                type="button"
                onClick={() => void back()}
                disabled={saving}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </button>
            ) : null}
            <div className="device-setup-heading">
              <h1 id="onboarding-title" tabIndex={-1} ref={titleRef}>
                {titles[step]}
              </h1>
              <p>{descriptions[step]}</p>
            </div>
            {message ? (
              <p className="device-error" role="alert" ref={errorRef} tabIndex={-1}>
                {message}
              </p>
            ) : null}
          </div>
          {step === 0 || step === 4 ? (
            <footer className="device-setup-cta">
              <button
                className="device-button device-button--large"
                type="button"
                onClick={() => void advance()}
                disabled={saving || (step === 0 && !permissionsReady)}
              >
                {saving ? 'Saving…' : step === 4 ? 'Finish setup' : 'Continue'}
              </button>
            </footer>
          ) : null}
        </section>
      </DeviceSetupLayout>
    </main>
  )
}
