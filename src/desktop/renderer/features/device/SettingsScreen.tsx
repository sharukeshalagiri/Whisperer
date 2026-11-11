import { useEffect, useRef, useState } from 'react'
import { AudioLines, CircleDot, Monitor, Plug, Plus, Shield, SlidersHorizontal, UserCircle, X } from 'lucide-react'
import type { ChangeEvent, ReactElement, ReactNode } from 'react'

import type { BootstrapState, ConnectionMode, PublicSettingsUpdate } from '../../../shared/contracts'
import { defaultShortcutBindings, normalizeShortcut, SHORTCUT_ACTION_IDS, SHORTCUT_ACTIONS, shortcutConflict, validateShortcut } from '../../../shared/shortcuts'
import type { ShortcutAction, ShortcutBindings } from '../../../shared/shortcuts'
import { ShortcutChips, ShortcutRecorder } from './ShortcutRecorder'
import { useShortcutSuspension } from './shortcut-keys'
import { hostnameOf, isDeviceMode, languageModelDestination, meetingAudioDestination, speechDestination } from './connection'
import { messageFromError, readCapabilities, readSettings, updateDeviceSettings } from './deviceApi'
import { InferenceForm, LocalServerPanel } from './InferenceSetup'
import { McpSettings } from './McpSettings'
import { useLocalServer } from './useLocalServer'
import { updateSummary } from './updates'

export type SettingsSection = 'general' | 'system' | 'notetaker' | 'inference' | 'mcp' | 'account' | 'privacy'

export interface SettingsScreenProps {
  /** Current renderer-safe state; credentials remain in the main process. */
  state: BootstrapState
  /** Refreshes state after a saved setting or account change. */
  onRefresh: () => Promise<void>
  /** Selects the initially visible settings category and responds to route changes. */
  initialSection?: SettingsSection
}
type BooleanSetting =
  | 'autoPaste'
  | 'launchAtLogin'
  | 'polish'
  | 'scratchpadInBar'
  | 'showStatusBar'
  | 'syncAtStartup'

type Dialog = 'shortcut' | 'microphone' | 'language' | 'signout' | 'delete-account' | 'erase-local' | null

const SETTINGS_SECTIONS: ReadonlyArray<{
  id: SettingsSection
  label: string
  group: 'settings' | 'account'
}> = [
  { id: 'general', label: 'General', group: 'settings' },
  { id: 'system', label: 'System', group: 'settings' },
  { id: 'notetaker', label: 'Notetaker', group: 'settings' },
  { id: 'inference', label: 'Inference', group: 'settings' },
  { id: 'mcp', label: 'MCP', group: 'settings' },
  { id: 'account', label: 'Account', group: 'account' },
  { id: 'privacy', label: 'Data and Privacy', group: 'account' },
]

const LANGUAGES = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['pt', 'Portuguese'],
] as const

/** Renders the modal settings panel using only renderer-safe device controls. */
export function SettingsScreen({
  state,
  onRefresh,
  initialSection = 'general',
}: SettingsScreenProps): ReactElement {
  const settings = readSettings(state)
  const capabilities = readCapabilities(state)
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const deviceMode = isDeviceMode(settings)
  const localServer = useLocalServer(settings)

  useEffect(() => {
    setSection(initialSection)
  }, [initialSection])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [transformShortcuts, setTransformShortcuts] = useState<string[]>([])
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [languageDraft, setLanguageDraft] = useState(settings.language || 'en')
  const [accountFirstName, setAccountFirstName] = useState(() => firstNameValue(state.user?.displayName))
  const [accountLastName, setAccountLastName] = useState(() => lastNameValue(state.user?.displayName))

  useEffect(() => {
    setAccountFirstName(firstNameValue(state.user?.displayName))
    setAccountLastName(lastNameValue(state.user?.displayName))
  }, [state.user?.displayName])

  useEffect(() => {
    if (dialog !== 'shortcut') return undefined
    let mounted = true
    void window.whisperer.transformations.list()
      .then((definitions) => { if (mounted) setTransformShortcuts(definitions.map((definition) => definition.shortcut).filter(Boolean)) })
      // SettingsService remains authoritative when an older main process cannot provide transforms.
      .catch(() => { if (mounted) setTransformShortcuts([]) })
    return () => { mounted = false }
  }, [dialog])

  async function save(partial: PublicSettingsUpdate, successMessage = 'Saved.'): Promise<void> {
    setError(undefined)
    setNotice(undefined)
    try {
      await updateDeviceSettings(partial)
      await onRefresh()
      setNotice(successMessage)
    } catch (saveError) {
      setError(messageFromError(saveError, 'We could not save that setting. Try again.'))
    }
  }

  function saveCheckbox(key: BooleanSetting) {
    return (event: ChangeEvent<HTMLInputElement>) =>
      void save({ [key]: event.target.checked } as PublicSettingsUpdate)
  }

  async function saveBindings(shortcutBindings: ShortcutBindings): Promise<void> {
    await updateDeviceSettings({ shortcutBindings })
    await onRefresh()
    setNotice('Shortcut saved')
  }

  async function signOut(): Promise<void> {
    setBusy('signout')
    setError(undefined)
    try {
      await window.whisperer.auth.signOut()
      await onRefresh()
    } catch (signOutError) {
      setError(messageFromError(signOutError, 'We could not sign you out. Try again.'))
    } finally {
      setBusy(undefined)
      setDialog(null)
    }
  }

  /** Switches backend. Main refuses with a clear message while capture or a transform runs. */
  async function switchMode(mode: ConnectionMode): Promise<void> {
    setBusy('mode')
    setError(undefined)
    setNotice(undefined)
    try {
      await window.whisperer.settings.setConnectionMode(mode)
      await onRefresh()
      if (mode === 'device') setNotice('Now using the server on this device. Your signed-in data is kept for when you switch back.')
    } catch (modeError) {
      setError(messageFromError(modeError, 'We could not switch servers. Try again.'))
    } finally {
      setBusy(undefined)
    }
  }

  async function saveAccountName(): Promise<void> {
    const firstName = accountFirstName.trim() || null
    const lastName = accountLastName.trim() || null
    if (!firstName && !lastName) {
      setError('Enter a name before saving.')
      return
    }
    setBusy('account')
    setError(undefined)
    try {
      await window.whisperer.account.save({ firstName, lastName })
      await onRefresh()
      setNotice('Name saved.')
    } catch (accountError) {
      setError(messageFromError(accountError, 'We could not save your name. Try again.'))
    } finally {
      setBusy(undefined)
    }
  }

  async function deleteAccount(): Promise<void> {
    setBusy('delete-account')
    setError(undefined)
    try {
      await window.whisperer.account.delete()
      await onRefresh()
      window.location.hash = '#/dictation'
    } catch (accountError) {
      setError(messageFromError(accountError, 'We could not delete your account. Try again.'))
    } finally {
      setBusy(undefined)
      setDialog(null)
    }
  }

  async function eraseLocalData(): Promise<void> {
    setBusy('erase-local')
    setError(undefined)
    setNotice(undefined)
    try {
      await window.whisperer.localData.erase()
      await onRefresh()
      setNotice('All on-device data was permanently deleted.')
    } catch (eraseError) {
      setError(messageFromError(eraseError, 'We could not delete on-device data. Try again.'))
    } finally {
      setBusy(undefined)
      setDialog(null)
    }
  }

  /** Merges on-device and signed-in remote data both ways. */
  async function syncData(): Promise<void> {
    setBusy('sync')
    setError(undefined)
    setNotice(undefined)
    try {
      const { changes } = await window.whisperer.dataSync.run()
      await onRefresh()
      setNotice(changes === 0 ? 'This device and your server are already in sync.' : `Synced ${changes} ${changes === 1 ? 'change' : 'changes'} between this device and your server.`)
    } catch (syncError) {
      setError(messageFromError(syncError, 'We could not sync with your server. Try again.'))
    } finally {
      setBusy(undefined)
    }
  }

  /** Checks the release feed now; state arrives through the normal state event as well. */
  async function checkForUpdates(): Promise<void> {
    setError(undefined)
    setNotice(undefined)
    try {
      await window.whisperer.updates.check()
      await onRefresh()
    } catch (checkError) {
      setError(messageFromError(checkError, 'We could not check for updates.'))
    }
  }

  /** Opens the installer of the update on offer in the default browser. */
  async function openUpdate(): Promise<void> {
    setError(undefined)
    try {
      await window.whisperer.updates.open('download')
      setNotice('The download opened in your browser. Run the installer to update.')
    } catch (openError) {
      setError(messageFromError(openError, 'We could not open the download.'))
    }
  }

  async function exportDiagnostics(): Promise<void> {
    setBusy('export')
    try {
      await window.whisperer.diagnostics.export()
      setNotice('Diagnostics export opened. Choose a location to save it.')
    } catch (diagnosticError) {
      setError(messageFromError(diagnosticError, 'We could not export diagnostics.'))
    } finally {
      setBusy(undefined)
    }
  }

  const selectedLanguage =
    LANGUAGES.find(([code]) => code === settings.language)?.[1] ?? settings.language
  const microphoneName = settings.microphoneId ? 'Selected microphone' : 'System default'
  const canSync = deviceMode && settings.authenticated && localServer.state === 'ready'

  return (
    <main className="settings-page" aria-label="Whisperer settings">
      <section className="settings-panel">
        <nav className="settings-navigation" aria-label="Settings categories">
          <p className="settings-nav-heading">Settings</p>
          {SETTINGS_SECTIONS.filter((item) => item.group === 'settings').map((item) => (
            <SettingsNavItem item={item} onSelect={setSection} selected={section} />
          ))}
          <hr />
          <p className="settings-nav-heading">Account</p>
          {SETTINGS_SECTIONS.filter((item) => item.group === 'account').map((item) => (
            <SettingsNavItem item={item} onSelect={setSection} selected={section} />
          ))}
          <span className="settings-version">Whisperer v{state.version}</span>
        </nav>

        <section className="settings-content" aria-live="polite">
          {error ? (
            <p className="form-error settings-feedback" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="form-notice settings-feedback" role="status">
              {notice}
            </p>
          ) : null}

          {section === 'general' ? (
            <SettingsPanel title="General">
              <div className="settings-row">
                <div>
                  <strong>Shortcuts</strong>
                  <p>{settings.shortcutBindings.holdToTalk[0] ? <>Hold <ShortcutChips platform={state.platform} value={settings.shortcutBindings.holdToTalk[0]} /> and speak.</> : 'No push-to-talk shortcut is set.'}</p>
                </div>
                <button className="settings-row-button" onClick={() => setDialog('shortcut')} type="button">Change</button>
              </div>
              <SettingsRow
                action="Change"
                detail={microphoneName}
                label="Microphone"
                onAction={() => setDialog('microphone')}
              />
              <SettingsRow
                action="Change"
                detail={selectedLanguage}
                label="Languages"
                onAction={() => {
                  setLanguageDraft(settings.language || 'en')
                  setDialog('language')
                }}
              />
              <ToggleRow
                checked={settings.polish}
                id="polish"
                label="Polish dictation with the language model"
                onChange={saveCheckbox('polish')}
              />
            </SettingsPanel>
          ) : null}

          {section === 'system' ? (
            <SettingsPanel title="System">
              <SelectRow
                label="Appearance"
                onChange={(event) =>
                  void save({ theme: event.target.value as 'light' | 'dark' | 'system' })
                }
                value={settings.theme}
              >
                <option value="system">System setting</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </SelectRow>
              <ToggleRow
                checked={settings.launchAtLogin}
                id="launch-at-login"
                label="Open Whisperer at login"
                onChange={saveCheckbox('launchAtLogin')}
              />
              <ToggleRow
                checked={settings.showStatusBar}
                id="show-status-bar"
                label="Show Whisperer bar"
                onChange={saveCheckbox('showStatusBar')}
              />
              <ToggleRow
                checked={settings.autoPaste}
                id="auto-paste"
                label="Paste transcriptions automatically"
                onChange={saveCheckbox('autoPaste')}
              />
              <ToggleRow
                checked={settings.scratchpadInBar}
                id="scratchpad-in-bar"
                label="Show scratchpad in Whisperer bar"
                onChange={saveCheckbox('scratchpadInBar')}
              />
              <SettingsRow
                action={state.updates.update ? 'Download' : state.updates.checking ? 'Checking…' : 'Check for updates'}
                detail={updateSummary(state.updates)}
                label="Updates"
                onAction={() => void (state.updates.update ? openUpdate() : checkForUpdates())}
              />
            </SettingsPanel>
          ) : null}

          {section === 'notetaker' ? (
            <SettingsPanel title="Notetaker">
              <p className="settings-unavailable">
                {meetingAudioDestination(settings)} Use Export audio on a meeting to save a copy elsewhere.
              </p>
            </SettingsPanel>
          ) : null}

          {section === 'inference' ? (
            deviceMode ? (
              <>
                <h1 id="settings-title">Inference</h1>
                <div className="settings-inference">
                  <section aria-labelledby="settings-inference-status">
                    <h2 className="settings-section-label" id="settings-inference-status">On-device server</h2>
                    <LocalServerPanel settings={settings} status={localServer} variant="settings" />
                  </section>
                  <section aria-labelledby="settings-inference-models">
                    <h2 className="settings-section-label" id="settings-inference-models">Models</h2>
                    <InferenceForm onSaved={onRefresh} settings={settings} status={localServer} variant="settings" />
                  </section>
                </div>
              </>
            ) : (
              <SettingsPanel title="Inference">
                <p className="settings-unavailable">
                  Your Whisperer server{hostnameOf(settings.apiHost) ? ` at ${hostnameOf(settings.apiHost)}` : ''} chooses
                  the speech and language models. Use this device instead to choose them here.
                </p>
                <SettingsRow
                  action={busy === 'mode' ? 'Switching…' : 'Use this device instead'}
                  detail="Runs the Whisperer server on this device. Nothing downloads until you set it up."
                  label="Server"
                  onAction={() => void switchMode('device')}
                />
              </SettingsPanel>
            )
          ) : null}

          {section === 'mcp' ? (
            <>
              <h1 id="settings-title">MCP</h1>
              <McpSettings apiHost={settings.apiHost} deviceMode={deviceMode} />
            </>
          ) : null}

          {section === 'account' && deviceMode ? (
            <SettingsPanel title="Account">
              <SettingsRow
                action={busy === 'mode' ? 'Switching…' : 'Sign in to a server instead'}
                detail="Running on this device"
                label="Server"
                onAction={() => void switchMode('remote')}
              />
              <SettingsRow
                detail="Notes, meetings, history and dictionary entries made on this device stay here. They are not merged into a server account."
                label="Your data"
              />
            </SettingsPanel>
          ) : null}

          {section === 'account' && !deviceMode ? (
            <SettingsPanel title="Account">
              <label className="settings-row settings-row--account-input"><span><strong>First name</strong><p>Your account name on this server.</p></span><input aria-label="First name" onChange={(event) => setAccountFirstName(event.target.value)} value={accountFirstName} /></label>
              <label className="settings-row settings-row--account-input"><span><strong>Last name</strong><p>Your account name on this server.</p></span><input aria-label="Last name" onChange={(event) => setAccountLastName(event.target.value)} value={accountLastName} /></label>
              <SettingsRow detail={state.user?.email ?? 'Not provided by your identity provider'} label="Email" />
              <SettingsRow detail={settings.apiHost || 'No server connected'} label="Server" />
              <SettingsRow action={busy === 'mode' ? 'Switching…' : 'Use this device instead'} detail="Run the Whisperer server on this device. Your server data is kept for when you switch back." label="On this device" onAction={() => void switchMode('device')} />
              <SettingsRow detail="Profile picture is managed by your identity provider." label="Profile picture" />
              <div className="settings-row"><div><strong>Profile</strong><p>Save your name to your account.</p></div><button className="settings-row-button" disabled={busy === 'account'} onClick={() => void saveAccountName()} type="button">{busy === 'account' ? 'Saving…' : 'Save'}</button></div>
              <SettingsRow action="Sign out" detail="This removes the encrypted local session. Your server account is unchanged." label="Sign out" onAction={() => setDialog('signout')} />
              <div className="settings-row settings-row--disabled-actions"><div><strong>Delete account</strong><p>Permanently deletes your account and server data. This cannot be undone.</p></div><button className="settings-danger-button" onClick={() => setDialog('delete-account')} type="button">Delete account</button></div>
            </SettingsPanel>
          ) : null}

          {section === 'privacy' ? (
            <SettingsPanel title="Data and Privacy">
              <p className="settings-unavailable">
                {speechDestination(settings)} Audio is sent only when you dictate, record a meeting or import
                audio. {languageModelDestination(settings)} Server-side retention and processing controls are not
                available in the desktop app.
              </p>
              <SettingsRow
                action={busy === 'export' ? 'Preparing…' : 'Export'}
                detail="Export redacted local diagnostics without account credentials."
                label="Diagnostics"
                onAction={() => void exportDiagnostics()}
              />
              <div className="settings-row">
                <div>
                  <strong>Sync with your server</strong>
                  <p>{dataSyncDetail(deviceMode, settings.authenticated, hostnameOf(settings.apiHost))}</p>
                </div>
                <button className="settings-row-button" disabled={!canSync || busy === 'sync'} onClick={() => void syncData()} type="button">
                  {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
              <ToggleRow
                checked={settings.syncAtStartup ?? false}
                disabled={!settings.authenticated}
                id="sync-at-startup"
                label="Sync automatically when the on-device server starts"
                onChange={saveCheckbox('syncAtStartup')}
              />
              {deviceMode ? (
                <div className="settings-row settings-row--disabled-actions">
                  <div>
                    <strong>Delete on-device data</strong>
                    <p>Permanently deletes every transcript, note, meeting and recording stored on this device. Downloaded models and settings stay.</p>
                  </div>
                  <button className="settings-danger-button" disabled={busy === 'erase-local'} onClick={() => setDialog('erase-local')} type="button">
                    {busy === 'erase-local' ? 'Deleting…' : 'Delete data'}
                  </button>
                </div>
              ) : null}
            </SettingsPanel>
          ) : null}
        </section>
      </section>

      {dialog === 'shortcut' ? (
        <ShortcutDialog
          bindings={settings.shortcutBindings}
          holdReason={capabilities.holdToTalk.granted ? null : capabilities.holdToTalk.reason ?? 'Press-and-hold shortcuts are unavailable on this device.'}
          meetingActive={state.meetingCapture !== null}
          onClose={() => setDialog(null)}
          onSave={saveBindings}
          platform={state.platform}
          transformShortcuts={transformShortcuts}
        />
      ) : null}
      {dialog === 'microphone' ? (
        <EditorDialog
          label="Microphone"
          onCancel={() => setDialog(null)}
          onSave={() => {
            void save({ microphoneId: null }, 'System microphone selected.')
            setDialog(null)
          }}
          title="Microphone"
        >
          <p>Use the system default microphone. Select a different input during device setup.</p>
        </EditorDialog>
      ) : null}
      {dialog === 'language' ? (
        <EditorDialog
          label="Language"
          onCancel={() => setDialog(null)}
          onSave={() => {
            void save({ language: languageDraft }, 'Language saved.')
            setDialog(null)
          }}
          title="Languages"
        >
          <select
            id="language-value"
            onChange={(event) => setLanguageDraft(event.target.value)}
            value={languageDraft}
          >
            {LANGUAGES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <p>
            Sent to the speech model as a hint. The on-device Parakeet model detects the language by itself and
            ignores it.
          </p>
        </EditorDialog>
      ) : null}
      {dialog === 'signout' ? (
        <ConfirmSignOut
          busy={busy === 'signout'}
          onCancel={() => setDialog(null)}
          onConfirm={() => void signOut()}
        />
      ) : null}
      {dialog === 'delete-account' ? <ConfirmDeleteAccount busy={busy === 'delete-account'} onCancel={() => setDialog(null)} onConfirm={() => void deleteAccount()} /> : null}
      {dialog === 'erase-local' ? <ConfirmEraseLocalData busy={busy === 'erase-local'} onCancel={() => setDialog(null)} onConfirm={() => void eraseLocalData()} /> : null}
    </main>
  )
}

/** Says what a sync moves and what it still needs, without promising more than the merge does. */
function dataSyncDetail(deviceMode: boolean, authenticated: boolean, server: string | null): string {
  if (!authenticated) return 'Sign in to your server to keep this device and your account in step.'
  if (!deviceMode) return 'Switch to this device to sync its data with your server.'
  return `Merges notes, dictionary, finished meeting text and dictation stats both ways with ${server ? server : 'your server'}. The newer edit wins and deletions carry over. Recordings stay where they were made.`
}

/** Gets an editable first-name value without inventing account data. */
function firstNameValue(displayName: string | undefined): string {
  return displayName?.trim().split(/\s+/)[0] || ''
}

/** Gets an editable family-name value without inventing account data. */
function lastNameValue(displayName: string | undefined): string {
  return displayName?.trim().split(/\s+/).slice(1).join(' ') || ''
}

const CATEGORY_ICONS = {
  general: SlidersHorizontal,
  system: Monitor,
  notetaker: CircleDot,
  inference: AudioLines,
  mcp: Plug,
  account: UserCircle,
  privacy: Shield,
} as const

/** Renders one category entry within the settings side navigation. */
function SettingsNavItem({
  item,
  onSelect,
  selected,
}: {
  item: { id: SettingsSection; label: string }
  onSelect: (section: SettingsSection) => void
  selected: SettingsSection
}): ReactElement {
  const Icon = CATEGORY_ICONS[item.id]
  return (
    <button
      aria-current={selected === item.id ? 'page' : undefined}
      className={selected === item.id ? 'is-selected' : undefined}
      key={item.id}
      onClick={() => onSelect(item.id)}
      type="button"
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
      {item.label}
    </button>
  )
}

/** Shows a titled settings panel with the shared row structure. */
function SettingsPanel({ children, title }: { children: ReactNode; title: string }): ReactElement {
  return (
    <>
      <h1 id="settings-title">{title}</h1>
      <div className="settings-rows">{children}</div>
    </>
  )
}

/** Renders a two-line preference row and optional action. */
function SettingsRow({
  action,
  detail,
  label,
  onAction,
}: {
  action?: string
  detail: string
  label: string
  onAction?: () => void
}): ReactElement {
  return (
    <div className="settings-row">
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
      {action ? (
        <button
          className={action === 'Sign out' ? 'settings-danger-button' : 'settings-row-button'}
          disabled={action === 'Preparing…' || action === 'Switching…' || action === 'Checking…'}
          onClick={onAction}
          type="button"
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}

/** Renders a real contract-backed select preference. */
function SelectRow({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode
  label: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  value: string
}): ReactElement {
  return (
    <label className="settings-row">
      <strong>{label}</strong>
      <select onChange={onChange} value={value}>
        {children}
      </select>
    </label>
  )
}

/** Renders a real contract-backed boolean preference. */
function ToggleRow({
  checked,
  disabled = false,
  id,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  id: string
  label: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}): ReactElement {
  return (
    <label
      className={`settings-row settings-row--toggle ${disabled ? 'is-disabled' : ''}`}
      htmlFor={id}
    >
      <strong>{label}</strong>
      <input checked={checked} disabled={disabled} id={id} onChange={onChange} type="checkbox" />
    </label>
  )
}

/** Displays a small focused editor above the settings panel. */
function EditorDialog({
  children,
  label,
  onCancel,
  onSave,
  title,
}: {
  children: ReactNode
  label: string
  onCancel: () => void
  onSave: () => void
  title: string
}): ReactElement {
  return (
    <div
      aria-labelledby="settings-editor-title"
      aria-modal="true"
      className="settings-dialog-backdrop"
      role="dialog"
    >
      <section className="settings-dialog">
        <h2 id="settings-editor-title">{title}</h2>
        <label>
          {label}
          {children}
        </label>
        <footer>
          <button className="settings-row-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="settings-primary-button" onClick={onSave} type="button">
            Save
          </button>
        </footer>
      </section>
    </div>
  )
}

/** Edits each action independently, rejecting invalid or colliding chords before saving. */
function ShortcutDialog({ bindings, holdReason, meetingActive, onClose, onSave, platform, transformShortcuts }: {
  bindings: ShortcutBindings
  holdReason: string | null
  meetingActive: boolean
  onClose: () => void
  onSave: (bindings: ShortcutBindings) => Promise<void>
  platform: BootstrapState['platform']
  transformShortcuts: readonly string[]
}): ReactElement {
  useShortcutSuspension(true)
  const [conflict, setConflict] = useState<string>()
  const [adding, setAdding] = useState<ShortcutAction>()
  const doubleTapChord = holdReason === null ? bindings.holdToTalk[0] : undefined
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || document.querySelector('.shortcut-recorder[data-capturing="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [onClose])
  const capabilityNotice = [
    'Fn and extra mouse buttons are not supported by this native adapter. Use a keyboard chord instead.',
    holdReason ? `${holdReason} Push-to-talk shortcuts are inactive.` : '',
  ].filter(Boolean).join(' ')

  function change(action: ShortcutAction, index: number, value: string): void {
    setAdding(undefined)
    setConflict(undefined)
    const next = { ...bindings, [action]: [...bindings[action]] }
    if (!value) next[action].splice(index, 1)
    else {
      const invalid = validateShortcut(value, platform)
      if (invalid) return setConflict(invalid)
      if (shortcutConflict(bindings, action, value, platform) || bindings[action].some((entry, position) => position !== index && entry === value) || transformShortcuts.some((shortcut) => normalizeShortcut(shortcut, platform) === normalizeShortcut(value, platform))) return setConflict('This shortcut is already in use')
      next[action][index] = value
    }
    if (action === 'holdToTalk' && !next.holdToTalk.length) return setConflict('Push to talk needs at least one shortcut.')
    void onSave(next).catch((reason) => setConflict(messageFromError(reason, 'The shortcut could not be saved.')))
  }

  function addBinding(action: ShortcutAction): void {
    setConflict(undefined)
    setAdding(action)
  }

  return (
    <div aria-labelledby="shortcut-dialog-title" aria-modal="true" className="settings-dialog-backdrop" role="dialog">
      <section className="settings-dialog shortcut-dialog">
        <header className="shortcut-dialog__header"><h2 id="shortcut-dialog-title">Shortcuts</h2><button aria-label="Close shortcuts" className="shortcut-dialog__close" onClick={onClose} type="button"><X aria-hidden="true" size={21} /></button></header>
        <p className="shortcut-dialog__subtitle">Choose your preferred shortcuts for using Whisperer.</p>
        <p className="shortcut-dialog__note">{capabilityNotice}</p>
        <div className="shortcut-dialog__body">
          {conflict ? <p className="form-error" role="alert">{conflict}</p> : null}
          <div className="shortcut-dialog__list">
            {SHORTCUT_ACTION_IDS.map((action) => {
              const label = SHORTCUT_ACTIONS[action].label
              const max = action === 'cancel' ? 1 : 4
              const values = bindings[action]
              const canAdd = values.length < max && adding !== action
              return (
                <div className="shortcut-dialog__row" data-shortcut-action={action} key={action}>
                  <div><strong>{label}</strong><p>{SHORTCUT_ACTIONS[action].description}</p></div>
                  <div className="shortcut-dialog__bindings">
                    {action === 'toggleRecording' && doubleTapChord ? <div aria-label="Double tap push-to-talk shortcut" className="shortcut-dialog__derived">Double tap <ShortcutChips platform={platform} value={doubleTapChord} /></div> : null}
                    {values.map((value, index) => <div className="shortcut-dialog__binding-line" key={`${value}:${index}`}><ShortcutRecorder actionLabel={label} onChange={(next) => change(action, index, next)} platform={platform} removable={action !== 'holdToTalk' || values.length > 1} value={value} />{canAdd && index === values.length - 1 ? <button aria-label={`Add another ${label} shortcut`} className="shortcut-dialog__add" onClick={() => addBinding(action)} type="button"><Plus aria-hidden="true" size={22} /></button> : null}</div>)}
                    {adding === action ? <div className="shortcut-dialog__binding-line"><ShortcutRecorder actionLabel={label} autoStart onCancel={() => setAdding(undefined)} onChange={(next) => change(action, values.length, next)} platform={platform} value="" /></div> : null}
                    {!values.length && canAdd ? <button aria-label={`Add another ${label} shortcut`} className="shortcut-dialog__add" onClick={() => addBinding(action)} type="button"><Plus aria-hidden="true" size={22} /></button> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <footer className="shortcut-dialog__footer">
          <button className="settings-row-button" disabled={meetingActive} onClick={() => { setConflict(undefined); void onSave(defaultShortcutBindings(platform)).catch((reason) => setConflict(messageFromError(reason, 'Defaults could not be saved.'))) }} title={meetingActive ? 'Stop the meeting recording before resetting shortcuts.' : undefined} type="button">Reset to default</button>
          <button className="settings-primary-button" onClick={onClose} type="button">Done</button>
        </footer>
      </section>
    </div>
  )
}

/** Confirms removal of the device-local authenticated session. */
function ConfirmSignOut({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  return (
    <div
      aria-labelledby="signout-dialog-title"
      aria-modal="true"
      className="settings-dialog-backdrop"
      role="dialog"
    >
      <section className="settings-dialog">
        <h2 id="signout-dialog-title">Sign out of Whisperer?</h2>
        <p>
          This removes the encrypted sign-in session from this device. Your account and server data
          are not changed.
        </p>
        <footer>
          <button className="settings-row-button" disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="settings-danger-button"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </footer>
      </section>
    </div>
  )
}

const ERASE_CONFIRMATION = 'DELETE'

/** Requires typing a confirmation word before permanently erasing on-device data. */
export function ConfirmEraseLocalData({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }): ReactElement {
  const [typed, setTyped] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmed = typed.trim() === ERASE_CONFIRMATION
  useEffect(() => {
    // Start on the safe choice; Escape cancels unless a deletion is already running.
    cancelRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy) return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [busy, onCancel])
  return (
    <div aria-describedby="erase-local-dialog-body" aria-labelledby="erase-local-dialog-title" aria-modal="true" className="settings-dialog-backdrop" role="alertdialog">
      <section className="settings-dialog">
        <h2 id="erase-local-dialog-title">Delete all on-device data?</h2>
        <div id="erase-local-dialog-body">
          <p>This permanently deletes everything Whisperer stored on this device:</p>
          <ul className="settings-dialog__list">
            <li>Dictation history and transcripts</li>
            <li>Notes and scratchpad drafts</li>
            <li>Meetings, their recordings, transcripts and summaries</li>
            <li>Dictionary entries, snippets and usage stats</li>
          </ul>
          <p>Downloaded models, inference choices and your settings stay. Data in a signed-in server account is not affected. This cannot be undone.</p>
        </div>
        <label>
          Type {ERASE_CONFIRMATION} to confirm
          <input autoCapitalize="characters" autoComplete="off" disabled={busy} onChange={(event) => setTyped(event.target.value)} spellCheck={false} value={typed} />
        </label>
        <footer>
          <button className="settings-row-button" disabled={busy} onClick={onCancel} ref={cancelRef} type="button">Cancel</button>
          <button className="settings-danger-button" disabled={busy || !confirmed} onClick={onConfirm} type="button">{busy ? 'Deleting…' : 'Delete permanently'}</button>
        </footer>
      </section>
    </div>
  )
}

/** Requires an explicit irreversible confirmation before deleting a server account. */
function ConfirmDeleteAccount({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }): ReactElement {
  return (
    <div aria-labelledby="delete-account-dialog-title" aria-modal="true" className="settings-dialog-backdrop" role="dialog">
      <section className="settings-dialog">
        <h2 id="delete-account-dialog-title">Delete your account?</h2>
        <p>This permanently deletes your account and data from your selected server, then signs this device out. This cannot be undone.</p>
        <footer>
          <button className="settings-row-button" disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button className="settings-danger-button" disabled={busy} onClick={onConfirm} type="button">{busy ? 'Deleting…' : 'Delete account'}</button>
        </footer>
      </section>
    </div>
  )
}
