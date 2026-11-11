import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  Bell,
  BookOpenText,
  CircleUserRound,
  ClipboardList,
  Cloud,
  Copy,
  FileText,
  Laptop,
  Maximize2,
  Mic,
  Minus,
  NotebookPen,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'

import type { BootstrapState, HistoryEntry } from '../shared/contracts'
import { shortcutLabel } from '../shared/shortcut-label'
import sidebarIconDarkUrl from '../assets/app-icon-dark.svg'
import sidebarIconLightUrl from '../assets/app-icon-light.svg'
import sidebarLogoDarkUrl from '../assets/sidebar-logo-dark.svg'
import sidebarLogoLightUrl from '../assets/sidebar-logo-light.svg'
import { Button, Dialog, ErrorBoundary, ShellRipple } from './components'
import { InsightsScreen } from './features/insights'
import { SidebarTooltip } from './components/SidebarTooltip'
import { dictationStatsFromMetrics } from './components/dictationStats'
import { formatHistoryTime, groupHistoryByDate, matchesHistoryEntry } from './features/content/ui-screen-utils'
import { DictionaryScreen } from './features/content/DictionaryScreen'
import { MeetingsScreen } from './features/content/MeetingsScreen'
import { NotesScreen } from './features/content/NotesScreen'
import { ScratchpadScreen } from './features/content/ScratchpadScreen'
import { SnippetsScreen } from './features/content/SnippetsScreen'
import { OnboardingScreen } from './features/device/OnboardingScreen'
import { formatInstallerSize } from './features/device/updates'
import { PermissionsCheckScreen } from './features/device/PermissionsCheckScreen'
import { needsPreflight } from './features/device/permissionCheck'
import { ShortcutActionHost } from './features/device/ShortcutActionHost'
import { SettingsScreen } from './features/device/SettingsScreen'
import { TransformsScreen } from './features/device/TransformsScreen'
import { SignInScreen } from './features/device/SignInScreen'
import { backendChanged, canEnterHub, connectionIndicator, connectionToggle, isDeviceMode, planBootstrap, readLocalServer, settingsSectionFromHash } from './features/device/connection'
import { messageFromError } from './features/device/deviceApi'
import './features/device/device.css'
import './features/device/inference.css'
import './features/content/content.css'
import './features/content/ui-content.css'
import './features/insights/insights.css'
import { MeetingCaptureProvider } from './features/meetings'
import { RecorderControls, RecordingOverlay, RecorderProvider, TransformPopup } from './features/recording'

/** Hash destinations supported by the authenticated desktop hub. */
type HubRoute = 'dictation' | 'insights' | 'dictionary' | 'snippets' | 'transforms' | 'meetings' | 'notes' | 'settings'

/** A hub route or the standalone, provider-free recording and scratchpad surfaces. */
type RendererRoute = HubRoute | 'scratchpad' | 'overlay' | 'transform-popup'

/** Describes a single sidebar destination. */
interface NavigationItem {
  /** The canonical hash route. */
  route: HubRoute
  /** Visible destination label. */
  label: string
  /** Icon accompanying the visible label. */
  icon: typeof Mic
}

const EMPTY_HISTORY: readonly HistoryEntry[] = []

/**
 * Page state while the hub moves between backends: the page leaves on the old backend, then
 * enters on the new one. Idle means the page is at rest. The shell ripple runs on its own clock.
 */
type ShellTransition = 'idle' | 'leaving' | 'entering'

/** One run of the shell ripple. A new id restarts it, so repeated switches each get a wave. */
interface RippleRun {
  id: number
  target: 'device' | 'remote'
}

/** How long the page takes to fade out before the new backend's state commits. Matches the CSS. */
const PAGE_LEAVE_MS = 260

/** How long the page takes to fade back in after the commit. Matches the CSS. */
const PAGE_ENTER_MS = 700

/** The hub sidebar navigation, in display order. */
const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { route: 'dictation', label: 'Dictation', icon: Mic },
  { route: 'meetings', label: 'Notetaker', icon: FileText },
  { route: 'insights', label: 'Insights', icon: BarChart3 },
  { route: 'dictionary', label: 'Dictionary', icon: BookOpenText },
  { route: 'snippets', label: 'Snippets', icon: ClipboardList },
  { route: 'transforms', label: 'Transforms', icon: Sparkles },
  { route: 'notes', label: 'Scratchpad', icon: NotebookPen },
]

/**
 * Parses current location while retaining historical desktop aliases.
 *
 * Args:
 *   hash: Browser location hash to resolve.
 *
 * Returns:
 *   A known route, defaulting to the Dictation hub.
 */
function getRoute(hash: string): RendererRoute {
  const path = (hash.split('?')[0] ?? '').replace(/^#\/?/, '')
  if (path === 'overlay' || path === 'scratchpad' || path === 'transform-popup') return path
  if (path === 'home' || path === 'history' || path === 'dictation') return 'dictation'
  if (path === 'meetings' || path === 'notes' || path === 'dictionary' || path === 'snippets' || path === 'transforms' || path === 'insights' || path === 'settings') return path
  return 'dictation'
}

/**
 * Gets the optional standalone scratchpad note identifier from the hash query.
 *
 * Args:
 *   hash: Browser hash containing optional query parameters.
 *
 * Returns:
 *   A persisted note identifier, or undefined for a new note.
 */
function getScratchpadNoteId(hash: string): string | undefined {
  const query = hash.split('?')[1]
  return query ? new URLSearchParams(query).get('id') || undefined : undefined
}

/**
 * Resolves a saved preference to a concrete document theme.
 *
 * Args:
 *   theme: Selected light, dark, or system appearance.
 *
 * Returns:
 *   The resolved document theme.
 */
function resolveTheme(theme: BootstrapState['settings']['theme']): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Identifies the local account scope for safely cached data.
 *
 * Args:
 *   state: Renderer-safe bootstrap state.
 *
 * Returns:
 *   The signed-in identity and host scope, or a signed-out sentinel.
 */
function accountScope(state: BootstrapState): string {
  // Device mode is its own scope; its loopback port changes per start, so it is not part of the key.
  if (isDeviceMode(state.settings)) return 'device'
  return state.settings.authenticated && state.user ? `${state.user.id}:${state.settings.apiHost ?? ''}` : 'signed-out'
}

/** Renders signed-in, onboarding, standalone, and signed-out desktop surfaces. */
export function App(): React.JSX.Element {
  const queryClient = useQueryClient()
  const activeScope = useRef<string | null>(null)
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [route, setRoute] = useState<RendererRoute>(() => getRoute(window.location.hash))
  // The checklist returns on each launch while a permission is missing, until the user continues.
  const [preflightDismissed, setPreflightDismissed] = useState(false)
  // A backend switch is staged: the page fades out on the old backend, state commits while it is
  // hidden and inert, then the page fades back in while the shell ripples. The newest state wins.
  const [transition, setTransition] = useState<ShellTransition>('idle')
  const [ripple, setRipple] = useState<RippleRun | null>(null)
  const committed = useRef<BootstrapState | null>(null)
  const staged = useRef<BootstrapState | null>(null)
  // Counts pushed states, so a slower bootstrap() answer never overwrites a newer push.
  const pushes = useRef(0)

  /** Applies safe state and evicts any previous account's cached data, including requests in flight. */
  const commitBootstrap = useCallback((nextState: BootstrapState): void => {
    const nextScope = accountScope(nextState)
    if (activeScope.current !== null && activeScope.current !== nextScope) {
      void queryClient.cancelQueries()
      queryClient.clear()
    }
    activeScope.current = nextScope
    committed.current = nextState
    setBootstrap(nextState)
    setLoadError(null)
  }, [queryClient])

  /** Commits immediately, or stages the state behind a page fade when it crosses backends. */
  const applyBootstrap = useCallback((nextState: BootstrapState): void => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const plan = planBootstrap(committed.current?.settings ?? null, staged.current !== null, nextState.settings, reducedMotion)
    if (plan === 'stage' || plan === 'restage') {
      staged.current = nextState
      if (plan === 'stage') setTransition('leaving')
      return
    }
    staged.current = null
    if (plan === 'cancel') { setTransition('idle'); setRipple(null) }
    commitBootstrap(nextState)
  }, [commitBootstrap])

  useEffect(() => {
    if (transition === 'idle') return undefined
    const timer = window.setTimeout(() => {
      if (transition === 'entering') { setTransition('idle'); return }
      const next = staged.current
      staged.current = null
      if (next === null) { setTransition('idle'); return }
      // A state that flipped back while hidden commits quietly: there is no switch left to show.
      const crossing = backendChanged(committed.current?.settings ?? null, next.settings)
      commitBootstrap(next)
      setTransition(crossing ? 'entering' : 'idle')
      if (crossing) setRipple((current) => ({ id: (current?.id ?? 0) + 1, target: isDeviceMode(next.settings) ? 'device' : 'remote' }))
    }, transition === 'leaving' ? PAGE_LEAVE_MS : PAGE_ENTER_MS)
    return () => window.clearTimeout(timer)
  }, [commitBootstrap, transition])

  /** Clears the ripple once its last wave has run. */
  const endRipple = useCallback((): void => setRipple(null), [])

  /** Refreshes bootstrap state through the limited preload bridge. */
  const refresh = useCallback(async (): Promise<void> => {
    const seen = pushes.current
    try {
      const nextState = await window.whisperer.bootstrap()
      if (pushes.current === seen) applyBootstrap(nextState)
    } catch {
      if (pushes.current === seen) setLoadError('Whisperer could not load local settings. Check that the desktop service is running, then try again.')
    }
  }, [applyBootstrap])

  useEffect(() => {
    void refresh()
    return window.whisperer.events.onState((nextState) => {
      pushes.current += 1
      applyBootstrap(nextState)
    })
  }, [applyBootstrap, refresh])

  useEffect(() => {
    const onHashChange = (): void => setRoute(getRoute(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!bootstrap) return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = (): void => { document.documentElement.dataset.theme = resolveTheme(bootstrap.settings.theme) }
    applyTheme()
    if (bootstrap.settings.theme !== 'system') return undefined
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [bootstrap])

  useEffect(() => {
    document.title = route === 'overlay' ? 'Whisperer recording' : route === 'transform-popup' ? 'Whisperer transform' : 'Whisperer'
    document.documentElement.dataset.window = route
  }, [route])

  if (route === 'overlay') return bootstrap ? <RecordingPresentation state={bootstrap} /> : <></>
  if (route === 'transform-popup') return <TransformPopup />
  if (loadError) return <StartupRecovery error={loadError} onRetry={() => void refresh()} />
  if (!bootstrap) return <LoadingScreen />
  if (route !== 'scratchpad' && needsPreflight(bootstrap.platform, bootstrap.capabilities, preflightDismissed)) return <div className="auth-window"><WindowControls nativeControls={bootstrap.platform === 'darwin'} /><PermissionsCheckScreen capabilities={bootstrap.capabilities} onContinue={() => setPreflightDismissed(true)} /></div>
  if (!canEnterHub(bootstrap.settings)) return <div className="auth-window"><WindowControls nativeControls={bootstrap.platform === 'darwin'} /><SignInScreen onComplete={refresh} /></div>
  if (!bootstrap.settings.onboardingCompleted) return <RecorderProvider microphoneId={bootstrap.settings.microphoneId}><div className="auth-window"><WindowControls nativeControls={bootstrap.platform === 'darwin'} /><OnboardingScreen state={bootstrap} onComplete={refresh} /></div></RecorderProvider>
  if (route === 'scratchpad') return <ScratchpadScreen noteId={getScratchpadNoteId(window.location.hash)} />

  return <Hub state={bootstrap} route={route} onRefresh={refresh} onRippleDone={endRipple} ripple={ripple} transition={transition} />
}

/** Presents the main-process recording pill without owning audio capture. */
function RecordingPresentation({ state }: { state: BootstrapState }): React.JSX.Element {
  const shortcut = shortcutLabel(state.settings.shortcut, state.platform)
  const bindingLabel = (bindings: string[]): string => bindings[0] ? shortcutLabel(bindings[0], state.platform) : ''
  return <RecordingOverlay
    dictationShortcut={shortcut}
    finishShortcut={shortcut}
    meeting={state.meetingCapture}
    transform={state.transform}
    quickTransform={state.quickTransform}
    edge={state.overlayDockEdge}
    notetakerShortcut={bindingLabel(state.settings.shortcutBindings.startMeeting)}
    transformShortcut={bindingLabel(state.settings.shortcutBindings.transform)}
    onOpenScratchpad={() => void window.whisperer.window.openScratchpad()}
    scratchpadShortcut={state.settings.scratchpadShortcut ? shortcutLabel(state.settings.scratchpadShortcut, state.platform) : null}
    showScratchpad={state.settings.scratchpadInBar}
    state={{ status: state.recording.status, mode: state.recording.mode, error: state.recording.error }}
  />
}

/** Props for the signed-in hub. */
interface HubProps {
  state: BootstrapState
  route: HubRoute
  onRefresh: () => Promise<void>
  /** Where the page is in a backend switch. */
  transition: ShellTransition
  /** The shell ripple to run, or null when none is running. */
  ripple: RippleRun | null
  /** Called when the ripple has finished. */
  onRippleDone: () => void
}

/**
 * Renders the authenticated hub beneath one recording provider. The shell carries the backend
 * transition as a data attribute so CSS can fade the page on every route. While the old backend's
 * page fades out it is inert, and the page remounts per account scope so nothing from the old
 * backend survives the switch. The ripple is keyed on its run so it replays on every switch.
 */
function Hub({ onRefresh, onRippleDone, ripple, route, state, transition }: HubProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const leaving = transition === 'leaving'
  return <RecorderProvider microphoneId={state.settings.microphoneId}>
    <MeetingCaptureProvider microphoneId={state.settings.microphoneId}>
      <div className={`app-shell app-shell--${state.platform}${collapsed ? ' app-shell--collapsed' : ''}`} data-connection={isDeviceMode(state.settings) ? 'device' : 'remote'} data-transition={transition}>
        <ShortcutActionHost />
        <Sidebar collapsed={collapsed} state={state} />
        <section className="workspace">
          <HubTopbar collapsed={collapsed} onCollapse={() => setCollapsed((value) => !value)} onRefresh={onRefresh} state={state} switching={leaving} />
          <main aria-busy={leaving || undefined} className="page-scroll" data-ripple-exclude="" inert={leaving}><ErrorBoundary key={accountScope(state)}><HubPage state={state} route={route} onRefresh={onRefresh} /></ErrorBoundary></main>
        </section>
        {ripple ? <ShellRipple key={ripple.id} onDone={onRippleDone} target={ripple.target} /> : null}
      </div>
    </MeetingCaptureProvider>
  </RecorderProvider>
}

/** Selects the active hub page for the current route. */
function HubPage({ onRefresh, route, state }: { state: BootstrapState; route: HubRoute; onRefresh: () => Promise<void> }): React.JSX.Element {
  switch (route) {
    case 'insights': return <InsightsScreen />
    case 'dictionary': return <DictionaryScreen />
    case 'snippets': return <SnippetsScreen />
    case 'transforms': return <TransformsScreen state={state} onRefresh={onRefresh} />
    case 'meetings': return <MeetingsScreen />
    case 'notes': return <NotesScreen />
    case 'settings': return <><DictationScreen state={state} /><Dialog hideHeader open title="Settings" onClose={() => { window.location.hash = '#/dictation' }}><div className="settings-modal"><SettingsScreen initialSection={settingsSectionFromHash(window.location.hash)} state={state} onRefresh={onRefresh} /></div></Dialog></>
    default: return <DictationScreen state={state} />
  }
}

/** Renders the device-oriented left navigation. */
function Sidebar({ collapsed, state }: { collapsed: boolean; state: BootstrapState }): React.JSX.Element {
  const activeRoute = getRoute(window.location.hash)
  return <aside className="sidebar" data-collapsed={collapsed}>
    <div className="brand-row">
      <SidebarTooltip label="Whisperer"><div aria-label="Whisperer" className="brand-row__mark" role="img">
        <img alt="" aria-hidden="true" className="brand-row__logo brand-row__logo--light" src={sidebarLogoLightUrl} />
        <img alt="" aria-hidden="true" className="brand-row__logo brand-row__logo--dark" src={sidebarLogoDarkUrl} />
        <img alt="" aria-hidden="true" className="brand-row__icon brand-row__icon--light" src={sidebarIconLightUrl} />
        <img alt="" aria-hidden="true" className="brand-row__icon brand-row__icon--dark" src={sidebarIconDarkUrl} />
      </div></SidebarTooltip>
      <ConnectionIndicator state={state} />
    </div>
    <nav aria-label="Main navigation" className="nav-list">
      {NAVIGATION_ITEMS.map(({ icon: Icon, label, route }) => <SidebarTooltip key={route} label={label}><a aria-current={activeRoute === route ? 'page' : undefined} className="nav-link" href={`#/${route}`}><Icon aria-hidden="true" size={18} /><span>{label}</span>{route === 'meetings' ? <b className="nav-link__new">New!</b> : null}</a></SidebarTooltip>)}
    </nav>
    <div className="sidebar__spacer" />
    <nav aria-label="Application options" className="nav-list nav-list--utility">
      <SidebarTooltip label="Settings"><a aria-current={activeRoute === 'settings' ? 'page' : undefined} className="nav-link" href="#/settings"><Settings aria-hidden="true" size={18} /><span>Settings</span></a></SidebarTooltip>
    </nav>
    <a className="compatibility-route" href="#/history">History</a>
  </aside>
}

/**
 * Shows which server the app talks to, beside the product mark. The tooltip names the remote
 * host or says "On this device"; it never claims the app is offline. Focusable for keyboards,
 * and it opens Settings at the Inference section.
 */
export function ConnectionIndicator({ state }: { state: BootstrapState }): React.JSX.Element {
  const { kind, label } = connectionIndicator(state.settings)
  const Icon = kind === 'device' ? Laptop : Cloud
  return <SidebarTooltip label={label}><a aria-label={label} className="connection-indicator" data-connection={kind} href="#/settings?section=inference">
    <Icon aria-hidden="true" size={15} strokeWidth={2} />
  </a></SidebarTooltip>
}

/**
 * Top-bar switch between the cloud server and this device. It flips only when both sides are
 * usable; otherwise it rests on the one side that is, disabled, and its tooltip says what to set
 * up. Flipping goes through the same guarded bridge call as Settings, so a recording in progress
 * refuses with the server's message. While a switch is still landing it stays put, so a second
 * click cannot race the first. The switch is where the backend-switch ripple starts.
 */
export function ConnectionToggle({ onRefresh, state, switching = false }: { onRefresh: () => Promise<void>; state: BootstrapState; switching?: boolean }): React.JSX.Element {
  const { mode, enabled, tooltip } = connectionToggle(state.settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const label = error ?? (busy || switching ? 'Switching…' : tooltip)

  /** Flips to the other backend; failures show in the tooltip until the next attempt. */
  const flip = async (): Promise<void> => {
    if (!enabled || busy || switching) return
    setBusy(true)
    setError(undefined)
    try {
      await window.whisperer.settings.setConnectionMode(mode === 'device' ? 'remote' : 'device')
      await onRefresh()
    } catch (flipError) {
      setError(messageFromError(flipError, 'We could not switch servers. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return <span className="connection-toggle" data-connection={mode} data-enabled={enabled}>
    <button aria-checked={mode === 'device'} aria-disabled={!enabled || busy || switching} aria-label={label} className="connection-toggle__switch" data-ripple-origin="" onClick={() => void flip()} role="switch" type="button">
      <Cloud aria-hidden="true" size={13} strokeWidth={2} />
      <span aria-hidden="true" className="connection-toggle__thumb" />
      <Laptop aria-hidden="true" size={13} strokeWidth={2} />
    </button>
    <span aria-hidden="true" className="connection-toggle__tooltip" role="tooltip">{label}</span>
  </span>
}

/**
 * Renders top-bar navigation, honest empty notifications, and account actions. A backend switch
 * closes both menus, so neither keeps showing the old backend's account or server.
 */
function HubTopbar({ collapsed, onCollapse, onRefresh, state, switching }: { collapsed: boolean; onCollapse: () => void; onRefresh: () => Promise<void>; state: BootstrapState; switching: boolean }): React.JSX.Element {
  const [accountOpen, setAccountOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  if (switching && (accountOpen || notificationsOpen)) {
    setAccountOpen(false)
    setNotificationsOpen(false)
  }
  const userName = state.user?.displayName || state.user?.email || 'Account'
  const deviceMode = isDeviceMode(state.settings)
  const serverLine = deviceMode ? `On this device · ${readLocalServer(state.settings).state === 'ready' ? 'running' : 'not running'}` : state.settings.apiHost || 'No server connected'

  /** Signs out only through the restricted account bridge. */
  const signOut = async (): Promise<void> => {
    setAccountOpen(false)
    await window.whisperer.auth.signOut()
    await onRefresh()
    window.location.hash = '#/dictation'
  }

  return <header className="hub-topbar">
    <SidebarTooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="topbar-icon" onClick={onCollapse} type="button"><PanelLeft aria-hidden="true" size={18} /></button></SidebarTooltip>
    <div className="hub-topbar__spacer" />
    <ConnectionToggle onRefresh={onRefresh} state={state} switching={switching} />
    <div className="topbar-menu">
      <button aria-expanded={notificationsOpen} aria-haspopup="dialog" aria-label={state.updates.update ? 'Notifications, update available' : 'Notifications'} className="topbar-icon" onClick={() => { setNotificationsOpen((value) => !value); setAccountOpen(false) }} type="button"><Bell aria-hidden="true" size={18} />{state.updates.update ? <span aria-hidden="true" className="topbar-icon__badge" /> : null}</button>
      {notificationsOpen ? <NotificationsPopover state={state} /> : null}
    </div>
    <div className="topbar-menu">
      <button aria-expanded={accountOpen} aria-haspopup="menu" aria-label="Account menu" className="account-trigger" onClick={() => { setAccountOpen((value) => !value); setNotificationsOpen(false) }} type="button"><span className="account-avatar"><CircleUserRound aria-hidden="true" size={20} /></span></button>
      {accountOpen ? <div className="account-menu" role="menu"><div className="account-menu__identity"><span className="account-avatar"><CircleUserRound aria-hidden="true" size={20} /></span><div><strong>{userName}</strong>{state.user?.email ? <span>{state.user.email}</span> : null}<span>{serverLine}</span></div></div><a className="account-menu__item" href="#/settings?section=account" onClick={() => setAccountOpen(false)} role="menuitem"><Settings aria-hidden="true" size={15} />{deviceMode ? 'Connection settings' : 'Manage account'}</a>{deviceMode ? null : <button className="account-menu__item" onClick={() => void signOut()} role="menuitem" type="button"><UserRound aria-hidden="true" size={15} />Sign out</button>}</div> : null}
    </div>
    <WindowControls nativeControls={state.platform === 'darwin'} />
  </header>
}

/** Lists local notifications; today the only source is a newer release found by the update check. */
function NotificationsPopover({ state }: { state: BootstrapState }): React.JSX.Element {
  const update = state.updates.update
  const [error, setError] = useState<string>()
  /** Opens a link main already holds; the renderer never names a URL. */
  const open = (target: 'download' | 'release'): void => {
    setError(undefined)
    window.whisperer.updates.open(target).catch(() => setError('Could not open the browser.'))
  }
  return <section aria-label="Notifications" className="topbar-popover" role="dialog">
    <h2>Notifications</h2>
    {update ? <div className="update-notice">
      <strong>Whisperer {update.version} is available</strong>
      <p>You have {state.updates.currentVersion}.{update.prerelease ? ' This is a preview release.' : ''} Install it over the current app; your data stays.</p>
      <div className="update-notice__actions">
        <Button onClick={() => open('download')} tone="primary">Download {formatInstallerSize(update.bytes)}</Button>
        <Button onClick={() => open('release')}>Release notes</Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div> : <p>No local notifications.</p>}
  </section>
}

/** Exposes only typed desktop window actions outside native macOS chrome. */
function WindowControls({ nativeControls }: { nativeControls: boolean }): React.JSX.Element | null {
  if (nativeControls) return null
  return <div className="window-controls" aria-label="Window controls"><button aria-label="Minimize" className="window-control" onClick={() => void window.whisperer.window.minimize()} type="button"><Minus aria-hidden="true" size={15} /></button><button aria-label="Maximize or restore" className="window-control" onClick={() => void window.whisperer.window.maximize()} type="button"><Maximize2 aria-hidden="true" size={14} /></button><button aria-label="Close" className="window-control window-control--close" onClick={() => void window.whisperer.window.close()} type="button"><X aria-hidden="true" size={16} /></button></div>
}

/** Renders the Dictation workspace from actual local history. */
function DictationScreen({ state }: { state: BootstrapState }): React.JSX.Element {
  const queryClient = useQueryClient()
  const historyQuery = useQuery({ queryKey: ['history'], queryFn: () => window.whisperer.history.list() })
  const entries = historyQuery.data ?? EMPTY_HISTORY
  const metricsQuery = useQuery({
    queryKey: ['metrics'],
    queryFn: () => window.whisperer.metrics.get(),
    staleTime: 60_000,
  })
  const stats = metricsQuery.data ? dictationStatsFromMetrics(metricsQuery.data) : undefined
  const deviceMode = isDeviceMode(state.settings)
  const localServer = readLocalServer(state.settings)
  // The device user is named "This device"; greet generically instead of "Welcome back, This".
  const firstName = deviceMode ? 'there' : (state.user?.displayName || state.user?.email || 'there').split(/\s|@/)[0] || 'there'
  const holdToTalk = state.settings.shortcutBindings.holdToTalk.length > 0 && state.capabilities.holdToTalk.supported && state.capabilities.holdToTalk.granted

  useEffect(() => window.whisperer.events.onHistoryChanged(() => {
    void queryClient.invalidateQueries({ queryKey: ['history'] })
    void queryClient.invalidateQueries({ queryKey: ['metrics'] })
  }), [queryClient])

  return <div className="page dictation-page">
    <header className="dictation-page__heading"><h1>Welcome back, {firstName}</h1></header>
    {deviceMode && localServer.state !== 'ready' ? <p className="device-mode-notice" role="status">{localServer.message ?? "The on-device server isn't running."} <a href="#/settings?section=inference">Open Inference settings</a></p> : null}
    <div className="dictation-overview">
      <section className="dictation-hero" aria-labelledby="dictation-title"><div><h2 id="dictation-title">{holdToTalk ? 'Hold down to dictate' : 'Press your shortcut to dictate'}</h2><p>{deviceMode ? 'Dictate wherever you write. History is kept by the server on this device.' : 'Dictate wherever you write. Your completed dictations stay on this device.'}</p><RecorderControls className="dictation-hero__controls" microphoneId={state.settings.microphoneId ?? undefined} startLabel="Start recording" stopLabel="Stop recording" /></div></section>
      <section className="dictation-stats" aria-label="Account dictation statistics"><dl><div><dt>total words</dt><dd>{stats ? compactCount(stats.totalWords) : '—'}</dd></div><div><dt>wpm</dt><dd>{stats ? stats.wordsPerMinute : '—'}</dd></div><div><dt>week streak</dt><dd>{stats ? stats.weekStreak : '—'}</dd></div></dl>{metricsQuery.isError ? <span role="status">Account metrics unavailable.</span> : null}</section>
      <DictationHistory entries={entries} error={historyQuery.isError} loading={historyQuery.isLoading} />
    </div>
  </div>
}

/** Formats large account totals compactly while leaving small counts exact. */
function compactCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

/** Shows searchable local dictation history with real copy and deletion actions. */
function DictationHistory({ entries, error, loading }: { entries: readonly HistoryEntry[]; error: boolean; loading: boolean }): React.JSX.Element {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  // The search starts as an icon, like the original, and opens into a field on request.
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const filteredEntries = useMemo(() => entries.filter((entry) => matchesHistoryEntry(entry, search)), [entries, search])
  const groups = useMemo(() => groupHistoryByDate(filteredEntries), [filteredEntries])

  /** Copies local history text via its restricted desktop API. */
  const copy = async (id: string): Promise<void> => {
    try { await window.whisperer.history.copy(id); setCopiedId(id); setActionError(null) } catch { setActionError('This dictation could not be copied.') }
  }

  /** Deletes one local entry after an explicit confirmation. */
  const remove = async (id: string): Promise<void> => {
    if (!window.confirm('Delete this local dictation? This cannot be undone.')) return
    try { await window.whisperer.history.delete(id); setActionError(null); await queryClient.invalidateQueries({ queryKey: ['history'] }) } catch { setActionError('This dictation could not be deleted.') }
  }

  /** Opens the field and focuses it; closing clears the filter so the list is whole again. */
  const toggleSearch = (): void => {
    if (searchOpen) { setSearch(''); setSearchOpen(false); return }
    setSearchOpen(true)
    requestAnimationFrame(() => searchInput.current?.focus())
  }

  return <section className="dictation-history" aria-labelledby="dictation-history-title">
    <header>
      <h2 id="dictation-history-title">History</h2>
      <div className="dictation-search" data-open={searchOpen}>
        <button aria-expanded={searchOpen} aria-label={searchOpen ? 'Close search' : 'Search dictations'} className="topbar-icon" onClick={toggleSearch} type="button">{searchOpen ? <X aria-hidden="true" size={16} /> : <Search aria-hidden="true" size={18} />}</button>
        {searchOpen ? <input aria-label="Search dictations" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') toggleSearch() }} placeholder="Search" ref={searchInput} type="search" value={search} /> : null}
      </div>
    </header>
    {actionError ? <p className="dictation-history__error" role="alert">{actionError}</p> : null}
    {loading ? <p className="dictation-history__status">Loading local history…</p> : null}
    {error ? <p className="dictation-history__status" role="alert">Local history is unavailable right now.</p> : null}
    {!loading && !error && !filteredEntries.length ? <div className="dictation-history__empty"><Search aria-hidden="true" size={23} /><h3>{entries.length ? 'No matching dictations' : 'No dictations yet'}</h3><p>{entries.length ? 'Try a different search.' : 'Once you dictate across different apps, your entire dictation history will appear here.'}</p></div> : null}
    {!loading && !error ? groups.map(([date, records]) => <section className="dictation-history__group" key={date} aria-label={date}>
      <h3>{date}</h3>
      <ul>{records.map((entry) => <li key={entry.id}>
        <time dateTime={entry.createdAt}>{formatHistoryTime(entry.createdAt)}</time>
        <span className="dictation-history__text">{entry.text || entry.rawText || 'Untitled dictation'}</span>
        <div className="dictation-history__actions">
          <button aria-label="Copy dictation" title="Copy dictation" className="topbar-icon" onClick={() => void copy(entry.id)} type="button"><Copy aria-hidden="true" size={16} /></button>
          <button aria-label="Delete dictation" title="Delete dictation" className="topbar-icon history-delete" onClick={() => void remove(entry.id)} type="button"><Trash2 aria-hidden="true" size={16} /></button>
        </div>
        {copiedId === entry.id ? <span className="dictation-history__copied" role="status">Copied</span> : null}
      </li>)}</ul>
    </section>) : null}
  </section>
}

/** Renders a neutral bootstrap wait surface. */
function LoadingScreen(): React.JSX.Element { return <main className="loading-screen"><span className="loading-mark" aria-hidden="true" /><h1>Setting up Whisperer</h1><p>Loading your device settings.</p></main> }

/** Renders a retryable bootstrap error without disclosing sensitive state. */
function StartupRecovery({ error, onRetry }: { error: string; onRetry: () => void }): React.JSX.Element { return <main className="fatal-error"><h1>Whisperer needs your attention</h1><p>{error}</p><Button tone="primary" onClick={onRetry}>Try again</Button></main> }
