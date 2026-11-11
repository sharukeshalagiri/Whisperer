import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFileSync, copyFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { release } from 'node:os';
import { basename, extname, isAbsolute, join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  protocol,
  safeStorage,
  session,
  screen,
  shell,
  systemPreferences,
  Tray,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';

import type {
  TransformActivity,
  AuthState,
  BootstrapState,
  Capabilities,
  Capability,
  CapabilityId,
  ConnectionMode,
  HistoryEntry,
  LocalServerStatus,
  Meeting,
  MeetingCaptureState,
  MeetingQuestionAnswer,
  Note,
  PublicSettings,
  RecordingState,
  RecordingMeter,
  Snippet,
} from '../shared/contracts';
import {
  CHANNELS,
  EVENT_RUNTIME_SPECS,
  IPC_RUNTIME_SPECS,
  type EventChannel,
  type RequestChannel,
} from '../shared/protocol';
import { PlatformService } from './platform/PlatformService';
import { electronAccelerator, SHORTCUT_ACTION_IDS } from '../shared/shortcuts';
import type { ShortcutAction } from '../shared/shortcuts';
import { ShortcutActionDispatcher, shortcutActionAllowed } from './runtime/ShortcutRuntimeService';
import type { ShortcutRecordingMode } from './runtime/ShortcutRuntimeService';
import { HoldShortcutService } from './platform/HoldShortcutService';
import { ApiError, ApiService } from './services/ApiService';
import { MeetingSyncService } from './services/MeetingSyncService';
import { Logger, redact } from './services/Logger';
import { SettingsService } from './services/SettingsService';
import { UpdateService } from './services/UpdateService';
import { RELEASE_FEED } from '../shared/releases';
import { LocalStore } from './storage/LocalStore';
import { localAssetType, resolveLocalAsset } from './runtime/LocalAssetResolver';
import { RecordingCoordinator } from './runtime/RecordingCoordinator';
import { TransformCoordinator } from './runtime/TransformCoordinator';
import { SenderGuard } from './runtime/SenderGuard';
import { clampOverlayBounds, dockOverlayBounds, dockOverlayWindowBounds, nearestOverlayDockEdge, parseOverlayDockEdge, type OverlayBounds, type OverlayPosition } from './runtime/OverlayGeometry';
import { overlayHoverActions, overlayPresentation, overlayWindowLayout, TRANSFORM_POPUP_SIZES, TRANSFORM_POPUP_TIMEOUT_MS, type OverlayDockEdge } from '../shared/overlay';
import { expandSpokenSnippets } from './runtime/SnippetExpander';
import { correctedWordCount, wordCount } from './runtime/DictationWordCounts';
import { ConnectionModeCoordinator } from './runtime/ConnectionModeCoordinator';
import { DataSyncCoordinator } from './runtime/DataSyncCoordinator';
import { LocalServerService, spawnLocalChild } from './runtime/LocalServerService';
import { freeDiskBytes, RuntimeInstaller, spawnCommand, type RuntimeManifest } from './runtime/RuntimeInstaller';
import runtimeManifest from './runtime/runtime-manifest.json';
import { MEETING_SEGMENT_MAX_BYTES, meetingChunkDecision } from './runtime/MeetingCaptureLimits';
import { cancelCaptureRecords, finalizeCapture, recoverInterruptedMeetings } from './runtime/MeetingFinalizer';
import { buildDiagnostics } from './runtime/Diagnostics';

// Native global shortcuts arrive through main rather than a DOM gesture; allow the owned, muted capture graph to resume.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: 'whisperer', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const execFileAsync = promisify(execFile);
/** Matches electron-builder's appId so tccutil can reset only this application's consent. */
const MAC_BUNDLE_ID = 'ai.whisperer.private';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
/** Offline session restore retries start here and double up to the maximum. */
const SESSION_RETRY_FIRST_MS = 15_000;
const SESSION_RETRY_MAX_MS = 5 * 60_000;
/** Fixed identity of the on-device account; the local server owns exactly one user. */
const DEVICE_USER = { id: 'device', displayName: 'This device', email: null } as const;
/** Store scope for on-device data, stable across loopback port changes and kept apart from every remote account. */
const DEVICE_SCOPE = { server: 'whisperer-device:local', userId: 'device' } as const;
/** IPC codes the renderer may branch on; anything else becomes INTERNAL. */
const PUBLIC_ERROR_CODES = new Set(['CONFLICT', 'LOCAL_SERVER_UNAVAILABLE', 'LLM_OFF']);
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join('; ');

/** Holds main-process objects and exposes only individually registered IPC operations. */
class DesktopMainRuntime {
  private hub: BrowserWindow | null = null;
  private overlay: BrowserWindow | null = null;
  private overlayHovered = false;
  /** Shortcut transform shown on the pill and in the result pop-up. */
  private transformActivity: TransformActivity | null = null;
  /** Latest applied shortcut transform, reopened by the View changes shortcut. */
  private lastAppliedTransform: Extract<TransformActivity, { phase: 'applied' }> | null = null;
  private transformPopup: BrowserWindow | null = null;
  private transformPopupExpanded = false;
  private transformPopupPinned = false;
  private transformPopupTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayDockEdge: OverlayDockEdge = 'bottom';
  private overlayDisplayId: number | null = null;
  private overlayFollowTimer: ReturnType<typeof setInterval> | null = null;
  private overlayDrag: { origin: OverlayBounds; cursor: OverlayPosition; moved: boolean } | null = null;
  private overlayEscapeRegistered = false;
  private readonly overlayDockFile: string;
  private scratchpad: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private accessibilityTimer: ReturnType<typeof setInterval> | null = null;
  private accessibilityTrusted = false;
  private quitting = false;
  private currentUser: { id: string; email?: string | null; displayName?: string } | null = null;
  private captureTarget: Awaited<ReturnType<PlatformService['captureTarget']>> = null;
  private sessionRetry: ReturnType<typeof setTimeout> | null = null;
  private sessionRetryDelay = SESSION_RETRY_FIRST_MS;
  private readonly registeredActions = new Set<string>();
  private readonly shortcutCaptureOwners = new Set<number>();
  private shortcutQueue: Promise<void> = Promise.resolve();
  private readonly shortcutDispatcher = new ShortcutActionDispatcher({
    start: async (mode) => { await this.startRecording(undefined, mode); },
    stop: async () => { await this.stopRecording(); },
    // An active pill drag owns Cancel first, because Escape is usually already registered as the Cancel shortcut.
    cancel: async () => { if (this.overlayDrag) this.dragOverlay('cancel'); else await this.cancelRecording(); },
    active: () => ['starting', 'recording'].includes(this.recording.status),
    setMode: () => { this.shortcutRecordingMode = 'handsfree'; this.publishState(); },
    action: (action) => this.dispatchShortcutAction(action),
    canStartMeeting: () => this.shortcutAllowed('startMeeting'),
    cancelAvailable: () => this.overlayDrag !== null || !['idle', 'error'].includes(this.recording.status),
    shortTap: () => { this.recording = { ...this.recording, error: 'Don’t tap. Hold your push-to-talk shortcut while speaking.' }; this.publishState(); },
  });
  private shortcutRecordingMode: ShortcutRecordingMode = 'handsfree';
  private recording: RecordingState = { status: 'idle', capturePhase: 'idle', startedAt: null, error: null };
  private recordingCancellationEpoch = 0;
  /** Maps superseded local draft IDs to their created server IDs for in-flight autosaves. */
  private readonly noteIdAliases = new Map<string, string>();
  private readonly windows = new Set<BrowserWindow>();
  private readonly senderGuard = new SenderGuard(() => [...this.windows].map((window) => window.webContents));
  private readonly recordingCoordinator = new RecordingCoordinator();
  private readonly logger: Logger;
  private readonly settings: SettingsService;
  private readonly store: LocalStore;
  private readonly meetingAudioDirectory: string;
  private meetingCapture: (MeetingCaptureState & { file: string; bytes: number; createdAt: number; segmentId: string; contentType: string }) | null = null;
  private readonly platform: PlatformService;
  private readonly holdShortcut: HoldShortcutService;
  private holdShortcutRegistered = false;
  private readonly api: ApiService;
  private readonly meetingSync: MeetingSyncService;
  private readonly updates: UpdateService;
  /** Keeps native targets and proposed replacement text in main-process memory only. */
  private readonly transformCoordinator: TransformCoordinator<NonNullable<Awaited<ReturnType<PlatformService['captureTarget']>>>>;
  /** Invalidates late network completions after account scope replacement or sign-out. */
  private meetingScopeEpoch = 0;
  private erasingLocalData = false;
  private readonly localServer: LocalServerService;
  private readonly modeSwitch: ConnectionModeCoordinator;
  private readonly dataSync: DataSyncCoordinator<Awaited<ReturnType<ApiService['exportSyncSnapshot']>>>;
  /** Cached so the synchronous public settings can say whether switching to this device needs a download. */
  private runtimeInstalled = false;
  private lastLocalServerEmit = 0;
  private lastLocalServerState: string | null = null;
  private localServerEmitTimer: ReturnType<typeof setTimeout> | null = null;
  private localShutdownDone = false;

  /** Creates main-process services without granting renderer code their capabilities. */
  constructor() {
    const dataDirectory = app.getPath('userData');
    this.overlayDockFile = join(dataDirectory, 'recording-pill.json');
    try {
      const saved = JSON.parse(readFileSync(this.overlayDockFile, 'utf8')) as { edge?: unknown };
      this.overlayDockEdge = parseOverlayDockEdge(saved?.edge);
    } catch { /* A missing or invalid local preference uses the bottom edge. */ }
    this.logger = new Logger(join(app.getPath('logs'), 'main.log'));
    this.settings = new SettingsService({ directory: dataDirectory, logger: this.logger, safeStorage });
    this.meetingAudioDirectory = join(dataDirectory, 'meeting-audio');
    this.store = new LocalStore({ databasePath: join(dataDirectory, 'desktop.sqlite'), audioDirectory: this.meetingAudioDirectory });
    this.platform = new PlatformService({
      clipboard,
      environment: process.env,
      execute: async (file, args, options) => {
        const result = await execFileAsync(file, [...args], options);
        return { stdout: result.stdout };
      },
      globalShortcut,
      platform: process.platform,
      shell,
      systemPreferences,
      // Only a packaged bundle has a stable identity whose consent records can be reset.
      bundleId: app.isPackaged ? MAC_BUNDLE_ID : undefined,
    });
    this.holdShortcut = new HoldShortcutService({
      platform: process.platform,
      environment: process.env,
      isAccessibilityGranted: () => process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false),
    });
    const apiSession = session.fromPartition('whisperer-api');
    // The bundled API project (root pyproject, uv.lock, apps/api) lives outside asar in packaged builds.
    const apiSource = app.isPackaged ? join(process.resourcesPath, 'api') : app.getAppPath();
    const installer = new RuntimeInstaller({
      manifest: runtimeManifest as RuntimeManifest,
      platformKey: `${process.platform}-${process.arch}`,
      root: join(dataDirectory, 'runtime'),
      apiSource,
      fetch: (url, init) => apiSession.fetch(url, init),
      run: spawnCommand,
      freeBytes: freeDiskBytes,
      environment: process.env,
    });
    this.localServer = new LocalServerService({
      installer,
      spawn: spawnLocalChild,
      // Loopback only; Node's fetch never applies a system proxy to it.
      fetch: (url, init) => fetch(url, init),
      dataDirectory: join(dataDirectory, 'device'),
      inference: () => this.settings.get().inference!,
      secrets: () => this.settings.inferenceSecrets(),
      environment: process.env,
      onChange: (status) => this.onLocalServerChange(status),
      shouldRun: () => this.deviceMode(),
    });
    this.api = new ApiService({
      fetch: apiSession.fetch.bind(apiSession),
      // A rejected remote session never disturbs on-device data.
      onSignOut: () => { if (this.deviceMode()) this.publishState(); else this.clearSession(); },
      openExternal: async (url: string) => shell.openExternal(url, { activate: true }),
      settings: this.settings,
      local: () => this.localServer.connection(),
    });
    this.modeSwitch = new ConnectionModeCoordinator({
      mode: () => this.settings.get().connectionMode ?? 'remote',
      persist: (mode) => this.settings.setConnectionMode(mode),
      busy: () => this.busyReason(),
      detach: () => this.detachScope(),
      attach: (mode) => this.attachScope(mode),
      startLocal: () => this.localServer.start(),
      // Cancel aborts an install in progress; stop then ends any launched child.
      stopLocal: () => this.localServer.cancel().then(() => this.localServer.stop()),
      log: (message) => this.logger.warn(message),
    });
    this.dataSync = new DataSyncCoordinator({
      ready: () => this.dataSyncBlocker(),
      exportSnapshot: (side) => this.api.exportSyncSnapshot(side),
      mergeSnapshot: (side, snapshot) => this.api.mergeSyncSnapshot(side, snapshot),
    });
    // The public feed needs no credentials; its own partition keeps it apart from API cookies.
    const updateSession = session.fromPartition('whisperer-updates');
    this.updates = new UpdateService({
      // Acceptance drives point an unpackaged build at a loopback Gitea-shaped feed; packaged builds ignore the override.
      feed: !app.isPackaged && process.env.WHISPERER_RELEASE_FEED_URL ? { provider: 'gitea', url: process.env.WHISPERER_RELEASE_FEED_URL, owner: 'fixture', repo: RELEASE_FEED.repo } : RELEASE_FEED,
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      fetch: (url, init) => updateSession.fetch(url, init),
      onChange: () => { this.publishState(); this.refreshTrayMenu(); },
      log: (message) => this.logger.warn(message),
    });
    this.meetingSync = new MeetingSyncService(
      this.api,
      this.store,
      (segment) => segment.audioPath && this.isContainedMeetingAudio(segment.audioPath) ? new Uint8Array(readFileSync(segment.audioPath)) : null,
      () => this.syncScopeToken(),
    );
    this.transformCoordinator = new TransformCoordinator<NonNullable<Awaited<ReturnType<PlatformService['captureTarget']>>>>({
      captureTarget: () => this.platform.captureTarget(),
      captureReviewTarget: async () => this.hub?.isFocused() ? this.platform.captureTarget() : null,
      captureSelection: (target) => this.platform.captureSelection(target),
      selectAll: (target) => this.platform.selectAll(target),
      insertReplacement: (text, target, sourceText) => this.platform.replaceCapturedSelection(text, target, sourceText),
      replaceSelection: (text, target, options) => this.platform.replaceSelection(text, target, options),
      transform: (input, options) => this.api.transform(input, options),
      definitions: () => this.settings.listTransforms(),
    });
  }

  /** Installs secure protocol, network, permissions, window, lifecycle, and named IPC configuration. */
  async start(): Promise<void> {
    this.installLogging();
    this.registerProtocol();
    this.lockRendererNetwork();
    this.registerIpc();
    this.createTray();
    this.applyLoginSetting();
    this.registerShortcut();
    this.watchAccessibility();
    // A transient offline profile request must never keep the local hub invisible.
    this.showHub();
    // Development builds carry the placeholder package version, so only packaged builds check on their own.
    if (app.isPackaged) this.updates.start();
    void this.refreshRuntimeInstalled().then(() => this.restoreConnection()).then(() => this.publishState()).catch((error) => this.logger.warn(`Session restore failed: ${safeMessage(error)}`));
    if (pendingDeepLink) {
      const deepLink = pendingDeepLink;
      pendingDeepLink = null;
      this.openDeepLink(deepLink);
    }
  }

  /** Allow OS quit and updater/restart requests to close the hub rather than hiding it to tray. */
  beginQuit(): void { this.quitting = true; }

  /** Whether quitting must first stop the owned on-device server. */
  needsLocalShutdown(): boolean {
    return !this.localShutdownDone && ['installing', 'starting', 'ready', 'stopping'].includes(this.localServer.status().state);
  }

  /** Cancels setup and stops the owned on-device server once, bounded so quitting never hangs. */
  async shutdownLocalServer(): Promise<void> {
    this.localShutdownDone = true;
    try { await Promise.race([this.localServer.cancel().then(() => this.localServer.stop()), delay(12_000)]); }
    catch (error) { this.logger.warn(`On-device server stop failed: ${safeMessage(error)}`); }
  }

  /** Stops application-owned native activity and closes SQLite before process exit. */
  stop(): void {
    this.updates.stop();
    // Quitting mid-meeting keeps what was recorded; Resume continues it after the next launch.
    this.finalizeActiveCapture('the app quitting');
    this.recordingCoordinator.cancel();
    this.holdShortcut.unregister();
    this.platform.unregisterShortcut();
    globalShortcut.unregisterAll();
    if (this.overlayFollowTimer) clearInterval(this.overlayFollowTimer);
    if (this.accessibilityTimer) clearInterval(this.accessibilityTimer);
    if (this.transformPopupTimer) clearTimeout(this.transformPopupTimer);
    if (this.localServerEmitTimer) clearTimeout(this.localServerEmitTimer);
    this.transformCoordinator.cancelRun();
    this.store.close();
  }

  /** Mirrors only warnings and errors to redacted OS-local logs without telemetry. */
  private installLogging(): void {
    for (const level of ['warn', 'error'] as const) {
      const original = console[level].bind(console);
      console[level] = (...values: unknown[]): void => {
        original(...values);
        this.logger[level](values.map((value) => String(value)).join(' '));
      };
    }
  }

  /** Registers the sole renderer resource origin and applies CSP to every served asset. */
  private registerProtocol(): void {
    const assetRoot = join(__dirname, '..', 'renderer');
    protocol.handle('whisperer', async (request) => {
      const url = new URL(request.url);
      if (url.hostname === 'local' && url.pathname.startsWith('/meeting-audio/')) return this.serveMeetingAudio(request, url);
      const asset = await resolveLocalAsset(assetRoot, request.url);
      if (!asset) return new Response(null, { status: 404 });
      const contentType = localAssetType(asset);
      if (!contentType) return new Response(null, { status: 403 });
      try {
        return new Response(readFileSync(asset), {
          headers: { 'Content-Security-Policy': CONTENT_SECURITY_POLICY, 'Content-Type': contentType },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    });
  }

  /** Cancels all renderer-originated requests except local application assets and in-memory media. */
  private lockRendererNetwork(): void {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const allowed = ['whisperer:', 'data:', 'blob:', 'devtools:'].includes(new URL(details.url).protocol);
      callback({ cancel: !allowed });
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => {
      return Boolean(
        this.hub?.webContents === contents
          && permission === 'media'
          && requestingOrigin === 'whisperer://local'
          && (this.connected() || !this.settings.get().onboardingCompleted),
      );
    });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      const ownedHub = this.hub?.webContents === contents;
      const mediaTypes = ('mediaTypes' in details ? details.mediaTypes : undefined) ?? [];
      const audioOnly = mediaTypes.length > 0 && mediaTypes.every((mediaType) => mediaType === 'audio');
      const onboardingRequest = !this.settings.get().onboardingCompleted;
      callback(Boolean(ownedHub && permission === 'media' && audioOnly && (onboardingRequest || this.recording.status === 'starting' || (this.connected() && this.meetingCapture?.status === 'starting'))));
    });
  }

  /** Builds an owned sandboxed BrowserWindow and prevents its navigation or popups. */
  private createWindow(route: string, options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const window = new BrowserWindow({
      backgroundColor: '#101014',
      icon: join(app.getAppPath(), 'src', 'desktop', 'assets', 'icon.png'),
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '..', 'preload', 'index.js'),
        sandbox: true,
        webSecurity: true,
      },
      ...options,
    });
    this.windows.add(window);
    const contentsId = window.webContents.id;
    window.on('closed', () => {
      this.windows.delete(window);
      if (this.shortcutCaptureOwners.delete(contentsId)) this.registerShortcut();
    });
    window.webContents.on('render-process-gone', () => {
      if (this.shortcutCaptureOwners.delete(contentsId)) this.registerShortcut();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) this.logger.warn(`[renderer] ${message}`);
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      this.logger.error(`[renderer gone] ${details.reason}`);
      // The hub owns the meeting recorder; without it the capture can never stop on its own.
      if (route === 'home') this.finalizeActiveCapture('the window crashing');
    });
    window.on('unresponsive', () => this.logger.warn('[renderer] window became unresponsive'));
    void window.loadURL(`whisperer://local/index.html#/${route}`);
    return window;
  }

  /** Shows or constructs the main hub. */
  /** Shows the hub from Electron lifecycle and tray callbacks. */
  showHub(): void {
    if (!this.hub || this.hub.isDestroyed()) {
      // The renderer draws the title bar: macOS keeps native traffic lights, other systems use in-app controls.
      const chrome: Electron.BrowserWindowConstructorOptions = process.platform === 'darwin'
        ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 18 } }
        : { frame: false };
      this.hub = this.createWindow('home', { ...chrome, height: 760, minHeight: 600, minWidth: 800, title: 'Whisperer', width: 1080 });
      this.hub.on('close', (event) => {
        if (!this.quitting && this.tray) {
          event.preventDefault();
          this.hub?.hide();
        }
      });
      this.hub.once('ready-to-show', () => this.hub?.show());
    } else {
      this.hub.show();
      this.hub.focus();
    }
  }

  /** Reports whether a tray is available to restore a deliberately hidden hub. */
  hasTray(): boolean {
    return this.tray !== null;
  }

  /** Opens the standalone scratchpad route in its own secure window. */
  private openScratchpad(noteId?: string): void {
    const route = noteId ? `scratchpad?id=${encodeURIComponent(noteId)}` : 'scratchpad';
    if (this.scratchpad && !this.scratchpad.isDestroyed()) {
      void this.scratchpad.loadURL(`whisperer://local/index.html#/${route}`);
      this.scratchpad.show();
      this.scratchpad.focus();
      return;
    }
    this.scratchpad = this.createWindow(route, { height: 420, minHeight: 200, minWidth: 300, title: 'Whisperer scratchpad', width: 500, frame: false });
    this.scratchpad.once('ready-to-show', () => this.scratchpad?.show());
  }

  /** Creates a small, non-focusing pill with transparent hit-area padding and no audio privileges. */
  private showOverlay(): void {
    if (!this.overlay || this.overlay.isDestroyed()) {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      this.overlayDisplayId = display.id;
      const layout = this.overlayLayout();
      this.overlay = this.createWindow('overlay', {
        ...dockOverlayWindowBounds(this.overlayDockEdge, layout.stack, layout.window, display.workArea),
        alwaysOnTop: true, focusable: false, frame: false, transparent: true, backgroundColor: '#00000000',
        hasShadow: false, roundedCorners: false, resizable: false, skipTaskbar: true,
        fullscreenable: false, maximizable: false, minimizable: false,
        type: process.platform === 'darwin' ? 'panel' : 'toolbar',
      });
      this.overlay.webContents.setBackgroundThrottling(false);
      this.overlay.setAlwaysOnTop(true, 'screen-saver');
      // Without skipTransformProcessType Electron hides the Dock icon and removes Whisperer from Mission Control.
      if (process.platform === 'darwin') this.overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      this.setOverlayPassThrough(true);
      this.overlay.once('ready-to-show', () => this.overlay?.showInactive());
      this.overlayFollowTimer = setInterval(() => this.followOverlayDisplay(), 400);
      screen.on('display-metrics-changed', () => this.layoutOverlay());
      screen.on('display-removed', () => this.followOverlayDisplay());
    } else this.overlay.showInactive();
    this.layoutOverlay();
  }

  /** Follows the display under the cursor without stealing focus or keeping stale removed-display bounds. */
  private followOverlayDisplay(): void {
    if (!this.overlay || this.overlay.isDestroyed() || !this.overlay.isVisible() || this.overlayDrag) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (display.id === this.overlayDisplayId) return;
    this.overlayDisplayId = display.id;
    this.overlayHovered = false;
    this.setOverlayPassThrough(true);
    this.layoutOverlay();
  }

  /** Derives bounds from the current visual state and persisted edge, never from stale absolute coordinates. */
  private layoutOverlay(): void {
    if (!this.overlay || this.overlay.isDestroyed() || this.overlayDrag?.moved) return;
    const display = screen.getAllDisplays().find((candidate) => candidate.id === this.overlayDisplayId)
      ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.overlayDisplayId = display.id;
    const layout = this.overlayLayout();
    this.overlay.setBounds(dockOverlayWindowBounds(this.overlayDockEdge, layout.stack, layout.window, display.workArea));
  }

  /** Bar and window sizes for the current state, dock edge and hover actions. */
  private overlayLayout(): ReturnType<typeof overlayWindowLayout> {
    const presentation = overlayPresentation(this.recording, this.publicMeetingCapture(), this.overlayHovered, this.transformActivity);
    const actions = overlayHoverActions({ quickTransform: this.quickTransform() !== null, scratchpad: this.settings.get().scratchpadInBar });
    return overlayWindowLayout(presentation, { edge: this.overlayDockEdge, actions: actions.length });
  }

  /** Visible bar bounds, excluding the transparent tooltip room the hovered window reserves. */
  private overlayBarBounds(area: Electron.Rectangle): Electron.Rectangle {
    return dockOverlayBounds(this.overlayDockEdge, this.overlayLayout().stack, area);
  }

  /** Opens the hub and starts Notetaker from the pill, exactly as the Notetaker shortcut does. */
  private async startNotetakerFromOverlay(event: IpcMainInvokeEvent): Promise<void> {
    this.requireOverlay(event);
    if (!this.shortcutAllowed('startMeeting')) throw new Error('Notetaker is unavailable right now.');
    await this.dispatchShortcutAction('startMeeting');
  }

  /** Changes idle hover sizing and pointer pass-through only for the owned overlay sender. */
  private setOverlayHovered(hovered: boolean, event: IpcMainInvokeEvent): void {
    this.requireOverlay(event);
    if (this.overlayDrag) return;
    this.overlayHovered = hovered;
    this.setOverlayPassThrough(!hovered);
    this.layoutOverlay();
  }

  /** Moves using main-owned cursor coordinates; release snaps to an edge and Escape restores the original dock. */
  private dragOverlay(command: 'begin' | 'move' | 'end' | 'cancel', event?: IpcMainInvokeEvent): void {
    if (event) this.requireOverlay(event);
    if (!this.overlay || this.overlay.isDestroyed()) return;
    const window = this.overlay;
    const cursor = screen.getCursorScreenPoint();
    if (command === 'begin') {
      this.overlayDrag = { origin: window.getBounds(), cursor, moved: false };
      // The pill never takes focus, so Escape is claimed only while a drag is active and only if free.
      if (!globalShortcut.isRegistered('Escape')) this.overlayEscapeRegistered = globalShortcut.register('Escape', () => this.dragOverlay('cancel'));
      return;
    }
    const drag = this.overlayDrag;
    if (!drag) return;
    const display = screen.getDisplayNearestPoint(cursor);
    if (command === 'move') {
      const dx = cursor.x - drag.cursor.x;
      const dy = cursor.y - drag.cursor.y;
      if (!drag.moved && Math.hypot(dx, dy) <= 5) return;
      drag.moved = true;
      this.overlayDisplayId = display.id;
      window.setBounds(clampOverlayBounds({ x: drag.origin.x + dx, y: drag.origin.y + dy }, drag.origin, display.workArea));
      return;
    }
    this.overlayDrag = null;
    if (this.overlayEscapeRegistered) globalShortcut.unregister('Escape');
    this.overlayEscapeRegistered = false;
    if (command === 'end' && drag.moved) {
      this.overlayDockEdge = nearestOverlayDockEdge(cursor, display.workArea);
      try {
        const temporary = `${this.overlayDockFile}.tmp`;
        writeFileSync(temporary, JSON.stringify({ edge: this.overlayDockEdge }), { mode: 0o600 });
        renameSync(temporary, this.overlayDockFile);
      } catch { this.logger.warn('Recording pill position could not be saved.'); }
      // The pill turns vertical on a side edge, so it must learn the new edge.
      this.publishState();
    }
    if (command === 'cancel') this.overlayDisplayId = screen.getDisplayNearestPoint(drag.cursor).id;
    this.overlayHovered = false;
    this.setOverlayPassThrough(true);
    this.layoutOverlay();
  }

  /** Shows active dictation and meetings even when the optional idle handle is disabled. */
  private syncStatusBar(): void {
    if (!this.connected()) { this.overlay?.hide(); return; }
    const active = this.meetingCapture !== null || !['idle', 'error'].includes(this.recording.status) || this.transformActivity?.phase === 'applying';
    if (active || this.settings.get().showStatusBar || this.recording.status === 'error') this.showOverlay();
    else this.overlay?.hide();
  }

  /** Relays hub-only transient measurements directly to the pill without storage or bootstrap publication. */
  private reportMeter(meter: RecordingMeter, event: IpcMainInvokeEvent): void {
    this.requireHub(event);
    const meeting = meter.source === 'meeting';
    if (meeting ? !this.meetingCapture || this.meetingCapture.status === 'stopping' : this.recording.status !== 'recording') return;
    const value = EVENT_RUNTIME_SPECS[CHANNELS.events.recordingMeter].payload.parse(meter);
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.webContents.send(CHANNELS.events.recordingMeter, value);
  }

  /** Lets transparent padding pass clicks through where Electron can still forward hover to the pill. */
  private setOverlayPassThrough(enabled: boolean): void {
    // Linux cannot forward ignored mouse movement, so ignoring it there would make the pill unreachable.
    if (process.platform !== 'linux') this.overlay?.setIgnoreMouseEvents(enabled, { forward: true });
  }

  /** Rejects hover and drag requests from the hub, scratchpad or any unowned sender. */
  private requireOverlay(event: IpcMainInvokeEvent): void {
    if (event.sender !== this.overlay?.webContents) throw new Error('Recording pill controls are unavailable in this window.');
  }

  /** Builds a tray only where the platform makes it available and never traps Linux in a hidden state. */
  private createTray(): void {
    try {
      // The menu bar needs a small template image; the 512px app icon is too wide for macOS to show.
      const icon = process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.png';
      this.tray = new Tray(join(app.getAppPath(), 'src', 'desktop', 'assets', icon));
      this.tray.setToolTip('Whisperer');
      this.refreshTrayMenu();
    } catch {
      this.tray = null;
    }
  }

  /** Rebuilds the tray menu so its update item names the current check state. */
  private refreshTrayMenu(): void {
    if (!this.tray) return;
    const { checking, update } = this.updates.status();
    const updateItem: MenuItemConstructorOptions = update
      ? { label: `Download Whisperer ${update.version}`, click: () => void this.openUpdate('download') }
      : { label: checking ? 'Checking for updates...' : 'Check for updates...', enabled: !checking, click: () => void this.updates.check() };
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Whisperer', click: () => this.showHub() },
      { label: 'Paste last transcript', click: () => void this.pasteLastFromTray() },
      { type: 'separator' },
      updateItem,
      { type: 'separator' },
      { label: 'Quit Whisperer', click: () => { this.quitting = true; app.quit(); } },
    ]));
  }

  /** Opens the installer or release notes of the update on offer in the default browser. Never a renderer-supplied URL. */
  private async openUpdate(target: 'download' | 'release'): Promise<void> {
    const url = this.updates.link(target);
    if (!url) throw Object.assign(new Error('No update is available.'), { code: 'CONFLICT' });
    await shell.openExternal(url, { activate: true });
  }

  /** Pastes the newest transcript once the menu has closed and the previous app is frontmost again. */
  private async pasteLastFromTray(): Promise<void> {
    try {
      await delay(250);
      await this.dispatchShortcutAction('pasteLastTranscript');
    } catch (error) {
      this.logger.warn(`Paste last transcript unavailable: ${safeMessage(error)}`);
    }
  }

  /**
   * Re-registers native shortcuts when Accessibility trust changes.
   *
   * macOS gives no event for a trust change, and the hold hook can only start once trust exists,
   * so a granted permission would otherwise stay unused until the next launch.
   */
  private watchAccessibility(): void {
    if (process.platform !== 'darwin') return;
    this.accessibilityTrusted = systemPreferences.isTrustedAccessibilityClient(false);
    this.accessibilityTimer = setInterval(() => {
      const trusted = systemPreferences.isTrustedAccessibilityClient(false);
      if (trusted === this.accessibilityTrusted) return;
      this.accessibilityTrusted = trusted;
      this.registerShortcut();
      this.publishState();
    }, 2000);
  }

  /** Applies login startup only where Electron supports the requested operating-system integration. */
  private applyLoginSetting(): void {
    if (process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: this.settings.get().launchAtLogin });
  }

  /** Reconciles independent bindings without ever downgrading a hold action into a toggle. */
  private registerShortcut(): void {
    this.holdShortcut.unregister();
    this.platform.unregisterShortcut();
    for (const accelerator of this.registeredActions) globalShortcut.unregister(accelerator);
    this.registeredActions.clear();
    this.holdShortcutRegistered = false;
    this.shortcutDispatcher.reset();
    if (this.shortcutCaptureOwners.size || !this.connected()) return;
    const bindings = this.settings.get().shortcutBindings;
    const allEntries = SHORTCUT_ACTION_IDS.filter((action) => this.shortcutAllowed(action)).flatMap((action) => bindings[action].map((accelerator) => ({
      action,
      accelerator,
      callbacks: {
        onStart: () => this.enqueueShortcut(action, true),
        onStop: () => { if (action === 'holdToTalk') this.enqueueShortcut(action, false); },
      },
    })));
    // One-shot chords must use Electron's exclusive OS registration. The observation hook cannot suppress Alt+digit delivery.
    const hookEntries = allEntries.filter((entry) => this.requiresHoldHook(entry.action, entry.accelerator));
    const directEntries = allEntries.filter((entry) => !this.requiresHoldHook(entry.action, entry.accelerator));
    const results = this.holdShortcut.registerMany(hookEntries.map(({ accelerator, callbacks }) => ({ accelerator, callbacks })), true);
    this.holdShortcutRegistered = results.some((result) => result.registered);
    for (const [index, entry] of hookEntries.entries()) {
      if (results[index]?.registered) continue;
      // Electron has no release events or modifier-only support. Those actions remain unavailable.
      if (entry.action === 'holdToTalk' || entry.action === 'cancel' || !entry.accelerator.split('+').some((key) => !['Control', 'Command', 'Super', 'Alt', 'Shift'].includes(key))) continue;
      try {
        if (globalShortcut.register(electronAccelerator(entry.accelerator), entry.callbacks.onStart)) this.registeredActions.add(electronAccelerator(entry.accelerator));
        else this.logger.warn(`The ${entry.action} shortcut is used by another application.`);
      } catch { this.logger.warn(`The ${entry.action} shortcut could not be registered.`); }
    }
    for (const entry of directEntries) {
      try {
        if (globalShortcut.register(electronAccelerator(entry.accelerator), entry.callbacks.onStart)) this.registeredActions.add(electronAccelerator(entry.accelerator));
        else this.logger.warn(`The ${entry.action} shortcut is used by another application.`);
      } catch { this.logger.warn(`The ${entry.action} shortcut could not be registered.`); }
    }
    this.registerTransformShortcuts();
    this.syncCancelShortcut();
  }

  /** Registers saved transform accelerators separately from recorder actions. */
  private registerTransformShortcuts(): void {
    const settings = this.settings.get();
    if (!settings.transformsEnabled || !this.connected() || !settings.onboardingCompleted) return;
    for (const definition of this.settings.listTransforms()) {
      // Polish is the primary Transform action and is registered exactly once from shortcutBindings.transform.
      if (definition.id === 'polish' || !definition.shortcut) continue;
      try {
        if (globalShortcut.register(electronAccelerator(definition.shortcut), () => this.enqueueTransform(definition.id))) this.registeredActions.add(electronAccelerator(definition.shortcut));
        else this.logger.warn(`The ${definition.name} shortcut is used by another application.`);
      } catch { this.logger.warn(`The ${definition.name} shortcut could not be registered.`); }
    }
  }

  /** Queues a shortcut transform so key handling never waits on the server. */
  private enqueueTransform(definitionId: string): void {
    this.shortcutQueue = this.shortcutQueue.then(async () => {
      if (!this.settings.get().transformsEnabled || this.shortcutCaptureOwners.size) return;
      void this.runShortcutTransform(definitionId);
    }).catch((error) => this.logger.warn(`Transform shortcut unavailable: ${safeMessage(error)}`));
  }

  /**
   * Applies a transform in place without bringing Whisperer forward.
   *
   * The pill shows "Applying <name>…" while the server works; the result is pasted at the cursor like
   * dictation, then a small pop-up above the pill offers the before/after comparison.
   */
  private async runShortcutTransform(definitionId?: string): Promise<void> {
    if (!['idle', 'error'].includes(this.recording.status)) {
      this.showTransformResult({ phase: 'failed', name: 'Transform', message: 'Finish dictating before running a transform.' });
      return;
    }
    this.closeTransformPopup();
    const status = await this.transformCoordinator.run(definitionId, (next) => {
      if (next.phase !== 'applying') return;
      this.transformActivity = next;
      this.publishState();
      this.layoutOverlay();
    });
    if (status.phase === 'failed') this.logger.warn(`Transform not applied: ${status.message}`);
    this.showTransformResult(status);
  }

  /** First transform in the list, offered on the pill; null when transforms are off or there are none. */
  private quickTransform(): { id: string; name: string } | null {
    if (!this.settings.get().transformsEnabled || !this.connected()) return null;
    const first = this.settings.listTransforms()[0];
    return first ? { id: first.id, name: first.name } : null;
  }

  /** Ends the pill's applying state and shows the outcome in the pop-up above it. */
  private showTransformResult(status: TransformActivity): void {
    if (status.phase === 'applied') this.lastAppliedTransform = { ...status, expanded: undefined };
    this.transformActivity = status;
    this.publishState();
    this.layoutOverlay();
    this.openTransformPopup(status.phase === 'applied' && status.expanded === true);
  }

  /** Opens the non-focusing result pop-up above the pill, replacing any previous one. */
  private openTransformPopup(expanded = false): void {
    this.transformPopupExpanded = expanded;
    this.transformPopupPinned = false;
    if (!this.transformPopup || this.transformPopup.isDestroyed()) {
      this.transformPopup = this.createWindow('transform-popup', {
        ...this.transformPopupBounds(),
        // The pop-up never takes focus, so the first click must act on See changes rather than only activate it.
        acceptFirstMouse: true,
        alwaysOnTop: true, focusable: false, frame: false, transparent: true, backgroundColor: '#00000000',
        hasShadow: false, roundedCorners: false, resizable: false, skipTaskbar: true,
        fullscreenable: false, maximizable: false, minimizable: false,
        type: process.platform === 'darwin' ? 'panel' : 'toolbar',
      });
      this.transformPopup.setAlwaysOnTop(true, 'screen-saver');
      if (process.platform === 'darwin') this.transformPopup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      this.transformPopup.on('closed', () => { this.transformPopup = null; });
      this.transformPopup.once('ready-to-show', () => this.transformPopup?.showInactive());
    } else {
      this.transformPopup.setBounds(this.transformPopupBounds());
      this.transformPopup.showInactive();
    }
    this.scheduleTransformPopupClose();
  }

  /** Places the pop-up centred above the pill, or beside it when the pill is docked to a side. */
  private transformPopupBounds(): Electron.Rectangle {
    const size = TRANSFORM_POPUP_SIZES[this.transformPopupExpanded ? 'expanded' : 'notice'];
    const display = screen.getAllDisplays().find((candidate) => candidate.id === this.overlayDisplayId)
      ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const pill = this.overlay && !this.overlay.isDestroyed() && this.overlay.isVisible()
      ? this.overlayBarBounds(area)
      : { x: area.x + area.width / 2, y: area.y + area.height - 23, width: 0, height: 0 };
    const gap = 8;
    let x = pill.x + pill.width / 2 - size.width / 2;
    let y = pill.y - size.height - gap;
    if (this.overlayDockEdge === 'left') { x = pill.x + pill.width + gap; y = pill.y + pill.height / 2 - size.height / 2; }
    if (this.overlayDockEdge === 'right') { x = pill.x - size.width - gap; y = pill.y + pill.height / 2 - size.height / 2; }
    return {
      x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - size.width))),
      y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - size.height))),
      ...size,
    };
  }

  /** Closes an untouched notice after a few seconds; an expanded or hovered pop-up stays. */
  private scheduleTransformPopupClose(): void {
    if (this.transformPopupTimer) clearTimeout(this.transformPopupTimer);
    this.transformPopupTimer = null;
    if (this.transformPopupExpanded || this.transformPopupPinned) return;
    this.transformPopupTimer = setTimeout(() => this.closeTransformPopup(), TRANSFORM_POPUP_TIMEOUT_MS);
  }

  /** Hides the pop-up and clears the finished transform from the pill. */
  private closeTransformPopup(): void {
    if (this.transformPopupTimer) clearTimeout(this.transformPopupTimer);
    this.transformPopupTimer = null;
    this.transformPopupExpanded = false;
    this.transformPopupPinned = false;
    if (this.transformPopup && !this.transformPopup.isDestroyed()) this.transformPopup.hide();
    if (this.transformActivity && this.transformActivity.phase !== 'applying') {
      this.transformActivity = null;
      this.publishState();
    }
  }

  /** A click on the pop-up activates Whisperer on macOS; hand focus straight back to the user's app. */
  private returnFocusAfterPopupClick(): void {
    if (this.hub?.isVisible() && this.hub.isFocused()) return;
    void this.platform.activateTarget(this.transformCoordinator.lastTarget()).catch(() => undefined);
  }

  /** Rejects pop-up controls from any window other than the pop-up itself. */
  private requireTransformPopup(event: IpcMainInvokeEvent): void {
    if (event.sender !== this.transformPopup?.webContents) throw new Error('Transform result controls are unavailable in this window.');
  }

  /** Leaves only recording gestures and modifier-only chords on the non-exclusive press/release hook. */
  private requiresHoldHook(action: ShortcutAction, accelerator: string): boolean {
    return action === 'holdToTalk' || action === 'toggleRecording' || action === 'cancel'
      || !accelerator.split('+').some((key) => !['Control', 'Command', 'Super', 'Alt', 'Shift'].includes(key));
  }

  /** Keeps Escape local to active recording when only Electron's press-only adapter is available. */
  private syncCancelShortcut(): void {
    if (this.holdShortcutRegistered) return;
    const active = !['idle', 'error'].includes(this.recording.status);
    for (const accelerator of this.settings.get().shortcutBindings.cancel) {
      if (active && this.shortcutAllowed('cancel')) {
        if (!this.registeredActions.has(electronAccelerator(accelerator)) && globalShortcut.register(electronAccelerator(accelerator), () => this.enqueueShortcut('cancel', true))) this.registeredActions.add(electronAccelerator(accelerator));
      } else if (this.registeredActions.delete(electronAccelerator(accelerator))) globalShortcut.unregister(electronAccelerator(accelerator));
    }
  }

  /** Applies the onboarding and capture gate to one action. */
  private shortcutAllowed(action: ShortcutAction): boolean {
    if ((action === 'transform' || action === 'transformView') && !this.settings.get().transformsEnabled) return false;
    return shortcutActionAllowed(action, { signedIn: this.connected(), onboardingCompleted: this.settings.get().onboardingCompleted, capturing: this.shortcutCaptureOwners.size > 0 });
  }

  /** Serializes press/release around asynchronous target capture; late releases cannot lose submission. */
  private enqueueShortcut(action: ShortcutAction, down: boolean): void {
    if (!this.shortcutAllowed(action)) return;
    const occurredAt = Date.now();
    this.shortcutQueue = this.shortcutQueue.then(async () => {
      if (!this.shortcutAllowed(action)) return;
      if (down) await this.shortcutDispatcher.down(action, occurredAt);
      else await this.shortcutDispatcher.up(action, occurredAt);
    }).catch((error) => this.logger.warn(`Shortcut action unavailable: ${safeMessage(error)}`));
  }

  /** Runs existing local actions; transforms only open a review surface, never overwrite or paste. */
  private async dispatchShortcutAction(action: Exclude<ShortcutAction, 'holdToTalk' | 'toggleRecording' | 'cancel'>): Promise<void> {
    if (action === 'scratchpad') { this.openScratchpad(); return; }
    if (action === 'startMeeting') {
      this.showHub();
      await this.startMeeting('');
      this.hub?.webContents.send(CHANNELS.events.shortcutAction, 'startMeeting');
      return;
    }
    if (action === 'transform') {
      void this.runShortcutTransform();
      return;
    }
    if (action === 'transformView') {
      if (!this.lastAppliedTransform) throw new Error('There is no applied Transform to view yet.');
      this.showTransformResult({ ...this.lastAppliedTransform, expanded: true });
      return;
    }
    if (action === 'pressEnter') { await this.platform.pressEnter(); return; }
    const latest = this.history().find((entry) => entry.status === 'completed' && entry.text);
    if (!latest) throw new Error('There is no completed transcript yet.');
    if (action === 'copyLastTranscript') { await clipboard.writeText(latest.text); return; }
    const target = await this.platform.captureTarget();
    const result = await this.platform.insertText(latest.text, target);
    if (!result.inserted) {
      await clipboard.writeText(latest.text);
      throw new Error(result.reason ?? 'Automatic paste unavailable. The last transcript is on the clipboard.');
    }
  }

  /** Restores the selected backend: on-device mode starts an installed server without downloading. */
  private async restoreConnection(): Promise<void> {
    if (this.deviceMode()) {
      this.attachScope('device');
      void this.localServer.start().catch((error) => this.logger.warn(`On-device server start failed: ${safeMessage(error)}`));
      return;
    }
    await this.restoreSession();
  }

  /** Restores an authenticated account scope without converting offline refresh into a forced logout. */
  private async restoreSession(): Promise<void> {
    if (this.sessionRetry) { clearTimeout(this.sessionRetry); this.sessionRetry = null; }
    if (!this.settings.getSession()) return;
    // Open the remembered account's cache at once, so an offline launch keeps history, notes,
    // snippets and dictation working; the server confirms the account when it is reachable.
    const remembered = this.settings.getSessionUserId();
    if (remembered && !this.deviceMode() && !this.store.hasScope()) {
      this.store.setScope({ server: this.settings.requireApiHost(), userId: remembered });
    }
    try {
      const scopeEpoch = this.meetingScopeEpoch;
      const user = await this.api.me();
      // A switch to on-device mode while this was in flight owns the scope now.
      if (scopeEpoch !== this.meetingScopeEpoch || this.deviceMode()) return;
      this.currentUser = user;
      this.sessionRetryDelay = SESSION_RETRY_FIRST_MS;
      this.settings.rememberSessionUser(user.id);
      this.store.setScope({ server: this.settings.requireApiHost(), userId: user.id });
      this.recoverMeetings();
      void this.meetingSync.sync().then(() => this.emit(CHANNELS.events.meetingsChanged, undefined)).catch(() => undefined);
    } catch (error) {
      if (isUnauthorized(error) && !this.deviceMode()) this.clearSession();
      else if (!this.deviceMode() && this.settings.getSession()) this.scheduleSessionRetry();
    }
    this.registerShortcut();
    this.publishState();
  }

  /** Retries an offline session restore with backoff until the server answers. */
  private scheduleSessionRetry(): void {
    if (this.sessionRetry) return;
    const delayMs = this.sessionRetryDelay;
    this.sessionRetryDelay = Math.min(delayMs * 2, SESSION_RETRY_MAX_MS);
    this.sessionRetry = setTimeout(() => {
      this.sessionRetry = null;
      if (this.deviceMode()) return;
      void this.restoreSession().catch((retryError) => this.logger.warn(`Session restore failed: ${safeMessage(retryError)}`));
    }, delayMs);
    this.sessionRetry.unref?.();
  }

  /** Whether the on-device server is the selected backend. */
  private deviceMode(): boolean { return this.settings.get().connectionMode === 'device'; }

  /** Whether a backend is selected that the hub may use: on-device mode, or a remote session. */
  private connected(): boolean { return this.deviceMode() || this.settings.getSession() !== null; }

  /** Names the in-flight work that must finish before a backend switch, or null. */
  private busyReason(): string | null {
    if (this.erasingLocalData) return 'erase';
    if (this.dataSync.running()) return 'sync';
    if (!['idle', 'error'].includes(this.recording.status)) return 'recording';
    if (this.meetingCapture) return 'meeting';
    if (this.transformActivity?.phase === 'applying') return 'transform';
    return null;
  }

  /** Identifies the delivery scope; on-device delivery waits until the owned server is verified. */
  private syncScopeToken(): string | null {
    if (this.deviceMode()) {
      const connection = this.localServer.connection();
      return connection ? `device\u0000${connection.generation}\u0000${this.meetingScopeEpoch}` : null;
    }
    return this.currentUser && this.settings.get().apiHost ? `${this.settings.get().apiHost}\u0000${this.currentUser.id}\u0000${this.meetingScopeEpoch}` : null;
  }

  /** Drops the active scope and every in-flight completion bound to it. Queued work stays in its own scope. */
  private detachScope(): void {
    this.meetingScopeEpoch += 1;
    this.api.invalidate();
    this.api.cancelLogin();
    this.recordingCancellationEpoch += 1;
    this.recordingCoordinator.cancel();
    this.captureTarget = null;
    this.currentUser = null;
    this.noteIdAliases.clear();
    this.store.setScope(null);
    if (this.scratchpad && !this.scratchpad.isDestroyed()) this.scratchpad.close();
  }

  /** Activates the scope for a backend: the fixed device account, or the retained remote session. */
  private attachScope(mode: ConnectionMode): void {
    if (mode === 'device') {
      this.currentUser = { ...DEVICE_USER };
      this.store.setScope(DEVICE_SCOPE);
      this.recoverMeetings();
    } else if (this.settings.getSession()) {
      void this.restoreSession().then(() => this.publishState()).catch(() => undefined);
    }
    this.registerShortcut();
    this.emit(CHANNELS.events.historyChanged, undefined);
    this.emit(CHANNELS.events.notesChanged, undefined);
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    this.publishState();
  }

  /** Switches backend for the renderer and returns the new public auth state. */
  private async setConnectionMode(mode: ConnectionMode): Promise<AuthState> {
    await this.modeSwitch.switchTo(mode);
    return this.authState();
  }

  /** Re-reads whether the on-device runtime exists. Reads disk only; never downloads. */
  private async refreshRuntimeInstalled(): Promise<void> {
    this.runtimeInstalled = await this.localServer.runtimeInstalled().catch(() => false);
  }

  /** Relays on-device status: every state change at once, progress at most four times a second. */
  private onLocalServerChange(status: LocalServerStatus): void {
    const stateKey = `${status.state}:${status.stage}:${status.speech.status}:${status.llm.status}`;
    const changed = stateKey !== this.lastLocalServerState;
    const becameReady = changed && status.state === 'ready' && !this.lastLocalServerState?.startsWith('ready:');
    this.lastLocalServerState = stateKey;
    const send = (): void => {
      this.localServerEmitTimer = null;
      this.lastLocalServerEmit = Date.now();
      this.emit(CHANNELS.events.localServerChanged, this.localServer.status());
    };
    if (changed) {
      if (this.localServerEmitTimer) clearTimeout(this.localServerEmitTimer);
      send();
      // Installing or failing may have created or removed the runtime, so re-read it before publishing.
      void this.refreshRuntimeInstalled().then(() => this.publishState());
    } else if (!this.localServerEmitTimer) {
      this.localServerEmitTimer = setTimeout(send, Math.max(0, 250 - (Date.now() - this.lastLocalServerEmit)));
    }
    if (becameReady && this.deviceMode()) {
      if (this.settings.get().syncAtStartup && this.settings.getSession()) void this.runDataSync().catch((error) => this.logger.warn(`Startup sync failed: ${safeMessage(error)}`));
      else void this.meetingSync.sync().then(() => this.emit(CHANNELS.events.meetingsChanged, undefined)).catch(() => undefined);
    }
  }

  /** Names why on-device and remote data cannot sync right now, or null when both sides are reachable. */
  private dataSyncBlocker(): string | null {
    if (!this.deviceMode()) return 'Switch to this device to sync it with your server.';
    if (!this.settings.getSession()) return 'Sign in to your server to sync this device with it.';
    if (!this.localServer.connection()) return "The on-device server isn't running yet.";
    if (this.modeSwitch.switching() || this.busyReason()) return 'Finish the current recording, meeting or transform before syncing.';
    return null;
  }

  /** Syncs both sides, then refreshes the on-device caches the hub shows. */
  private async runDataSync(): Promise<{ changes: number }> {
    const result = await this.dataSync.run();
    await this.meetingSync.sync().catch(() => undefined);
    this.emit(CHANNELS.events.notesChanged, undefined);
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    this.emit(CHANNELS.events.historyChanged, undefined);
    return result;
  }

  /** Requires on-device mode for local server controls. */
  private requireDeviceMode(): void {
    if (!this.deviceMode()) throw Object.assign(new Error('Switch to on-device mode first.'), { code: 'CONFLICT' });
  }

  /** Saves engine settings and relaunches a running server so it reads the new configuration and keys. */
  private async updateInference(input: import('../shared/contracts').InferenceUpdate): Promise<PublicSettings> {
    const state = this.localServer.status().state;
    const relaunch = this.deviceMode() && (state === 'ready' || state === 'starting' || state === 'failed');
    if (relaunch && this.busyReason()) throw Object.assign(new Error('Finish the current recording, meeting or transform before changing engines.'), { code: 'CONFLICT' });
    this.settings.updateInference(input);
    if (relaunch) void this.localServer.restart().catch((error) => this.logger.warn(`On-device restart failed: ${safeMessage(error)}`));
    this.publishState();
    return this.publicSettings();
  }

  /** Probes one engine through the verified on-device server. */
  private async testInference(target: 'speech' | 'llm'): Promise<{ ok: boolean; latencyMs: number | null; message: string }> {
    this.requireDeviceMode();
    const response = await this.localRequest('/v1/inference/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }) }, 60_000);
    const body = await response.json() as { ok?: unknown; latencyMs?: unknown; message?: unknown };
    void this.localServer.refreshInference();
    return {
      ok: body.ok === true,
      latencyMs: typeof body.latencyMs === 'number' && Number.isFinite(body.latencyMs) && body.latencyMs >= 0 ? body.latencyMs : null,
      message: typeof body.message === 'string' && body.message ? redact(body.message).slice(0, 500) : body.ok === true ? 'Working.' : 'The test failed.',
    };
  }

  /** Starts one catalog model download on the on-device server; progress arrives as server events. */
  private async downloadModel(model: string): Promise<LocalServerStatus> {
    this.requireDeviceMode();
    await this.localRequest('/v1/inference/models/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }, 15_000);
    await this.localServer.refreshInference();
    return this.localServer.status();
  }

  /**
   * Permanently erases on-device data: the server's rows and recordings first, then this app's
   * on-device cache, pending uploads and private meeting audio. Remote data and models stay.
   */
  private async eraseLocalData(): Promise<void> {
    this.requireDeviceMode();
    const busy = this.modeSwitch.switching() ? 'switch' : this.busyReason();
    if (busy) {
      const message = busy === 'erase' ? 'On-device data is already being deleted.' : 'Finish the current recording, meeting or transform before deleting on-device data.';
      throw Object.assign(new Error(message), { code: 'CONFLICT' });
    }
    this.erasingLocalData = true;
    try {
      // The server holds most of the data, so nothing local is removed unless it succeeds.
      await this.localRequest('/v1/local/data', { method: 'DELETE' }, 60_000);
      // Late sync results and uploads for the erased scope must never write back.
      this.meetingScopeEpoch += 1;
      this.noteIdAliases.clear();
      this.store.setScope(DEVICE_SCOPE);
      const scopeDirectory = this.store.eraseScope();
      rmSync(join(this.meetingAudioDirectory, scopeDirectory), { recursive: true, force: true });
      this.logger.warn('On-device data was deleted at the user\'s request.');
    } finally {
      this.erasingLocalData = false;
    }
    this.emit(CHANNELS.events.historyChanged, undefined);
    this.emit(CHANNELS.events.notesChanged, undefined);
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    this.publishState();
  }

  /** Sends one request to the verified on-device server and maps its failures to safe messages. */
  private async localRequest(path: string, init: RequestInit, timeout: number): Promise<Response> {
    if (!this.localServer.connection()) throw Object.assign(new Error("The on-device server isn't running."), { code: 'LOCAL_SERVER_UNAVAILABLE' });
    const response = await this.localServer.request(path, { ...init, signal: AbortSignal.timeout(timeout) });
    if (response.ok) return response;
    let detail = '';
    try { const body = await response.json() as { detail?: unknown }; detail = typeof body.detail === 'string' ? body.detail : ''; } catch { /* Bodies are optional. */ }
    throw Object.assign(new Error(redact(detail || `The on-device server answered ${response.status}.`).slice(0, 300)), response.status === 409 ? { code: 'CONFLICT' } : {});
  }

  /** Registers each explicit IPC operation with sender and payload validation at its boundary. */
  private registerIpc(): void {
    this.handle(CHANNELS.app.bootstrap, async () => this.bootstrap());
    this.handle(CHANNELS.auth.signIn, async ({ apiHost }) => this.signIn(apiHost));
    this.handle(CHANNELS.auth.cancel, async () => { this.api.cancelLogin(); return this.authState(); });
    this.handle(CHANNELS.auth.signOut, async () => {
      // In on-device mode this only forgets a retained remote session; device data stays.
      if (this.deviceMode()) { await this.api.signOut().catch(() => undefined); this.publishState(); return this.authState(); }
      await this.api.signOut(); this.clearSession(); return this.authState();
    });
    this.handle(CHANNELS.settings.update, async (partial) => this.updateSettings(partial));
    this.handle(CHANNELS.settings.setConnectionMode, async ({ mode }) => this.setConnectionMode(mode));
    this.handle(CHANNELS.localServer.setup, async () => { this.requireDeviceMode(); await this.localServer.setup(); return this.localServer.status(); });
    this.handle(CHANNELS.localServer.restart, async () => { this.requireDeviceMode(); await this.localServer.restart(); return this.localServer.status(); });
    this.handle(CHANNELS.localServer.cancel, async () => { await this.localServer.cancel(); return this.localServer.status(); });
    this.handle(CHANNELS.inference.update, async (input) => this.updateInference(input));
    this.handle(CHANNELS.inference.test, async ({ target }) => this.testInference(target));
    this.handle(CHANNELS.inference.downloadModel, async ({ model }) => this.downloadModel(model));
    this.handle(CHANNELS.settings.shortcutCapture, async ({ active }, event) => {
      this.requireHub(event);
      if (active) this.shortcutCaptureOwners.add(event.sender.id);
      else this.shortcutCaptureOwners.delete(event.sender.id);
      this.registerShortcut();
    });
    this.handle(CHANNELS.permissions.list, async () => this.capabilities());
    this.handle(CHANNELS.permissions.request, async ({ capability }) => this.requestCapability(capability));
    this.handle(CHANNELS.transformPopup.setExpanded, async ({ expanded }, event) => {
      this.requireTransformPopup(event);
      this.transformPopupExpanded = expanded;
      this.transformPopup?.setBounds(this.transformPopupBounds());
      this.scheduleTransformPopupClose();
      this.returnFocusAfterPopupClick();
    });
    this.handle(CHANNELS.transformPopup.setPinned, async ({ pinned }, event) => {
      this.requireTransformPopup(event);
      this.transformPopupPinned = pinned;
      this.scheduleTransformPopupClose();
    });
    this.handle(CHANNELS.transformPopup.dismiss, async (_payload, event) => {
      this.requireTransformPopup(event);
      this.closeTransformPopup();
      this.returnFocusAfterPopupClick();
    });
    this.handle(CHANNELS.permissions.check, async () => {
      await this.platform.probeAutomation();
      return this.capabilities();
    });
    this.handle(CHANNELS.permissions.openSettings, async ({ capability }) => {
      const result = await this.platform.openPermissionSettings(capability);
      if (!result.ok) throw new Error(result.reason ?? 'System Settings could not be opened.');
    });
    this.handle(CHANNELS.recording.start, async (_payload, event) => this.startRecording(event));
    this.handle(CHANNELS.recording.stop, async (_payload, event) => this.stopRecording(event));
    this.handle(CHANNELS.recording.cancel, async (_payload, event) => this.cancelRecording(event));
    this.handle(CHANNELS.recording.submit, async (submission, event) => this.submitRecording(submission, event));
    this.handle(CHANNELS.recording.reportPhase, async (report, event) => this.reportPhase(report, event));
    this.handle(CHANNELS.recording.reportMeter, async (meter, event) => this.reportMeter(meter, event));
    this.handle(CHANNELS.overlay.setHovered, async ({ hovered }, event) => this.setOverlayHovered(hovered, event));
    this.handle(CHANNELS.overlay.drag, async ({ command }, event) => this.dragOverlay(command, event));
    this.handle(CHANNELS.overlay.startNotetaker, async (_payload, event) => this.startNotetakerFromOverlay(event));
    this.handle(CHANNELS.history.list, async () => this.history());
    this.handle(CHANNELS.history.delete, async ({ id }) => { this.store.deleteHistory(id); this.emit(CHANNELS.events.historyChanged, undefined); });
    this.handle(CHANNELS.history.clear, async () => { this.store.clearHistory(); this.emit(CHANNELS.events.historyChanged, undefined); });
    this.handle(CHANNELS.history.copy, async ({ id }) => this.copyHistory(id));
    this.handle(CHANNELS.notes.list, async () => this.notes());
    this.handle(CHANNELS.notes.save, async (note) => this.saveNote(note));
    this.handle(CHANNELS.notes.delete, async ({ id }) => this.deleteNote(id));
    this.handle(CHANNELS.notes.summarize, async ({ id }) => this.summarizeNote(id));
    this.handle(CHANNELS.notes.open, async ({ id }) => this.openScratchpad(id));
    this.handle(CHANNELS.dictionary.list, async () => this.api.listDictionary());
    this.handle(CHANNELS.dictionary.save, async (entry) => this.api.saveDictionary(entry));
    this.handle(CHANNELS.dictionary.delete, async ({ id }) => this.api.deleteDictionary(id));
    this.handle(CHANNELS.snippets.list, async () => this.snippets());
    this.handle(CHANNELS.snippets.save, async (snippet) => this.saveSnippet(snippet));
    this.handle(CHANNELS.snippets.delete, async ({ id }) => { this.store.deleteSnippet(id); });
    this.handle(CHANNELS.meetings.list, async () => this.listMeetings());
    this.handle(CHANNELS.meetings.get, async ({ id }) => this.getMeeting(id));
    this.handle(CHANNELS.meetings.save, async (meeting) => this.saveMeeting(meeting));
    this.handle(CHANNELS.meetings.saveTranscript, async (input) => this.saveMeetingText('transcript', input));
    this.handle(CHANNELS.meetings.saveSummary, async (input) => this.saveMeetingText('summary', input));
    this.handle(CHANNELS.meetings.ask, async (input) => this.askMeetingQuestion(input));
    this.handle(CHANNELS.meetings.regenerateSummary, async ({ id }) => this.regenerateMeetingSummary(id));
    this.handle(CHANNELS.meetings.resume, async ({ id }, event) => this.resumeMeeting(id, event));
    this.handle(CHANNELS.meetings.retry, async ({ id }) => this.retryMeeting(id));
    this.handle(CHANNELS.meetings.sync, async () => this.syncMeetings());
    this.handle(CHANNELS.meetings.delete, async ({ id }) => {
      if (this.meetingCapture?.id === id) throw new Error('Stop the recording before deleting this meeting.');
      const scopeEpoch = this.meetingScopeEpoch;
      try { await this.api.deleteMeeting(id); }
      catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
      if (scopeEpoch !== this.meetingScopeEpoch) throw new Error('The session changed.');
      const segments = this.store.listMeetingSegments(id);
      for (const segment of segments) {
        if (segment.audioPath && this.isContainedMeetingAudio(segment.audioPath)) unlinkSync(segment.audioPath);
        this.store.discardOutboxForEntity(segment.id);
        this.store.deleteMeetingSegment(segment.id);
      }
      this.store.discardOutboxForEntity(id);
      this.removeMeeting(id);
      this.emit(CHANNELS.events.meetingsChanged, undefined);
    });
    this.handle(CHANNELS.meetings.captureStart, async ({ title }, event) => this.startMeeting(title, event));
    this.handle(CHANNELS.meetings.captureStop, async (_payload, event) => this.stopMeeting(event));
    this.handle(CHANNELS.meetings.captureCancel, async (_payload, event) => { this.requireHub(event); this.cancelMeeting(); });
    this.handle(CHANNELS.meetings.captureAppend, async (payload, event) => this.appendMeeting(payload, event));
    this.handle(CHANNELS.meetings.captureFinish, async (payload, event) => this.finishMeeting(payload, event));
    this.handle(CHANNELS.meetings.captureFail, async ({ id, error }, event) => { this.requireHub(event); if (this.meetingCapture?.id === id) { this.logger.warn(`Meeting capture failed: ${redact(error)}`); this.cancelMeeting(); } });
    this.handle(CHANNELS.meetings.importAudio, async (_payload, event) => { this.requireHub(event); return this.importMeetingAudio(); });
    this.handle(CHANNELS.meetings.exportAudio, async ({ id }) => this.exportMeetingAudio(id));
    this.handle(CHANNELS.metrics.get, async () => this.api.getMetrics());
    this.handle(CHANNELS.metrics.daily, async (range) => this.api.getDailyMetrics(range));
    this.handle(CHANNELS.metrics.apps, async () => this.api.getAppMetrics());
    this.handle(CHANNELS.transformations.list, async () => this.settings.listTransforms());
    this.handle(CHANNELS.transformations.save, async (input) => {
      const saved = this.settings.saveTransform(input);
      this.registerShortcut();
      this.publishState();
      return saved;
    });
    this.handle(CHANNELS.transformations.delete, async ({ id }) => {
      this.settings.deleteTransform(id);
      this.registerShortcut();
      this.publishState();
    });
    this.handle(CHANNELS.transformations.reset, async () => {
      const definitions = this.settings.resetTransforms();
      this.registerShortcut();
      this.publishState();
      return definitions;
    });
    this.handle(CHANNELS.transformations.start, async ({ definitionId }) => {
      const review = await this.transformCoordinator.start(definitionId);
      this.emit(CHANNELS.events.transformReview, review);
      return review;
    });
    this.handle(CHANNELS.transformations.preview, async (input) => this.api.transform(input));
    this.handle(CHANNELS.transformations.view, async () => {
      const review = this.transformCoordinator.latest();
      if (review) { this.emit(CHANNELS.events.transformReview, review); return review; }
      // Shortcut transforms apply first and offer the before/after afterwards, as the
      // transformView shortcut shows; the Transforms page button opens the same view.
      if (!this.lastAppliedTransform) throw new Error('There is no applied Transform to view yet.');
      this.showTransformResult({ ...this.lastAppliedTransform, expanded: true });
      return null;
    });
    this.handle(CHANNELS.transformations.generate, async ({ sessionId }) => this.transformCoordinator.generate(sessionId));
    this.handle(CHANNELS.transformations.accept, async ({ sessionId }) => this.transformCoordinator.accept(sessionId));
    this.handle(CHANNELS.transformations.reject, async ({ sessionId }) => this.transformCoordinator.reject(sessionId));
    this.handle(CHANNELS.transformations.runQuick, async (_payload, event) => {
      this.requireOverlay(event);
      const quick = this.quickTransform();
      if (!quick) throw new Error('Turn on Transforms to use this button.');
      void this.runShortcutTransform(quick.id);
    });
    this.handle(CHANNELS.account.save, async (input) => this.saveAccount(input));
    this.handle(CHANNELS.account.delete, async () => {
      if (this.deviceMode()) throw new Error('There is no account to delete in on-device mode.');
      await this.api.deleteAccount();
      return this.authState();
    });
    this.handle(CHANNELS.dataSync.run, async () => this.runDataSync());
    this.handle(CHANNELS.localData.erase, async () => this.eraseLocalData());
    this.handle(CHANNELS.window.minimize, async (_payload, event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
    this.handle(CHANNELS.window.maximize, async (_payload, event) => this.toggleMaximize(event));
    this.handle(CHANNELS.window.close, async (_payload, event) => BrowserWindow.fromWebContents(event.sender)?.close());
    this.handle(CHANNELS.window.showHub, async () => this.showHub());
    this.handle(CHANNELS.window.openScratchpad, async ({ noteId }) => this.openScratchpad(noteId));
    this.handle(CHANNELS.clipboard.copy, async ({ text }) => { await clipboard.writeText(text); });
    this.handle(CHANNELS.diagnostics.export, async () => this.exportDiagnostics());
    this.handle(CHANNELS.diagnostics.open, async () => { await shell.openPath(app.getPath('logs')); });
    this.handle(CHANNELS.updates.check, async () => this.updates.check());
    this.handle(CHANNELS.updates.open, async ({ target }) => this.openUpdate(target));
  }

  /** Registers one named handler and prevents any unowned renderer or invalid payload from reaching it. */
  private handle<C extends RequestChannel>(channel: C, operation: (payload: never, event: IpcMainInvokeEvent) => Promise<unknown>): void {
    ipcMain.handle(channel, async (event, payload) => {
      if (!event.senderFrame || !this.senderGuard.allows({ sender: event.sender, senderFrame: event.senderFrame })) {
        return { ok: false, error: { code: 'FORBIDDEN', message: 'This frame cannot use desktop controls.' } };
      }
      try {
        const parsed = IPC_RUNTIME_SPECS[channel].request.parse(payload);
        const result = await operation(parsed as never, event);
        return { ok: true, data: result };
      } catch (error) {
        return { ok: false, error: this.ipcError(error) };
      }
    });
  }

  /** Returns startup state with credentials excluded and service failures represented safely. */
  private async bootstrap(): Promise<BootstrapState> {
    const capture = this.meetingCapture;
    const meetingCapture: MeetingCaptureState | null = capture ? { id: capture.id, title: capture.title, status: capture.status, startedAt: capture.startedAt, error: capture.error } : null;
    return { capabilities: await this.capabilities(), recording: Object.assign({}, this.recording, { mode: this.shortcutRecordingMode }), settings: this.publicSettings(), user: this.publicUser(), version: app.getVersion(), platform: desktopPlatform(), meetingCapture, transform: this.transformActivity, quickTransform: this.quickTransform(), overlayDockEdge: this.overlayDockEdge, updates: this.updates.status(), signInCode: this.api.pendingSignInCode() };
  }

  /** Completes a device login, scopes local data to that exact server and user, then publishes state. */
  private async signIn(apiHost: string): Promise<AuthState> {
    if (this.deviceMode()) throw Object.assign(new Error('Switch to a server before signing in.'), { code: 'CONFLICT' });
    const pending = this.api.signIn(apiHost);
    // Show the approval code while the browser step runs; the server page must match it.
    this.publishState();
    let result: Awaited<typeof pending>;
    try { result = await pending; } finally { this.publishState(); }
    if (result !== null && !this.deviceMode()) {
      const user = await this.api.me();
      this.currentUser = user;
      this.settings.rememberSessionUser(user.id);
      this.store.setScope({ server: this.settings.requireApiHost(), userId: user.id });
      void this.meetingSync.sync().then(() => this.emit(CHANNELS.events.meetingsChanged, undefined)).catch(() => undefined);
      this.registerShortcut();
    }
    const state = this.authState();
    this.publishState();
    return state;
  }

  /** Handles a desktop link without awaiting it, logging a rejection to the application log. */
  openDeepLink(rawUrl: string): void {
    void this.handleDeepLink(rawUrl).catch((error) => this.logger.warn(`Deep link was rejected: ${safeMessage(error)}`));
  }

  /** Correlates an operating-system-delivered desktop link with a pending verifier-bound login. */
  async handleDeepLink(rawUrl: string): Promise<void> {
    const url = new URL(rawUrl);
    if (url.protocol !== 'whisperer:') return;
    await this.api.handleDeepLink(rawUrl);
    if (!this.settings.getSession() || this.deviceMode()) return;
    const user = await this.api.me();
    this.currentUser = user;
    this.store.setScope({ server: this.settings.requireApiHost(), userId: user.id });
    this.registerShortcut();
    this.publishState();
  }

  /** Applies main-owned preference side effects and updates renderer-safe state. */
  private async updateSettings(partial: Record<string, unknown>): Promise<PublicSettings> {
    const update = { ...partial };
    // Retained for backwards-compatible settings payloads; audio retention has no desktop implementation.
    delete update.retainAudio;
    if (Object.hasOwn(update, 'microphoneId')) update.microphoneId = update.microphoneId ?? '';
    this.settings.update(update as never);
    if (Object.hasOwn(partial, 'shortcut') || Object.hasOwn(partial, 'scratchpadShortcut') || Object.hasOwn(partial, 'holdToTalk') || Object.hasOwn(partial, 'shortcutBindings') || Object.hasOwn(partial, 'onboardingCompleted') || Object.hasOwn(partial, 'transformsEnabled')) this.registerShortcut();
    if (Object.hasOwn(partial, 'showStatusBar') || Object.hasOwn(partial, 'scratchpadInBar')) this.syncStatusBar();
    if (Object.hasOwn(partial, 'launchAtLogin')) this.applyLoginSetting();
    this.publishState();
    return this.publicSettings();
  }

  /** Starts capture only from the hub and captures the paste target before focus can change. */
  private async startRecording(event?: IpcMainInvokeEvent, mode: ShortcutRecordingMode = 'handsfree'): Promise<RecordingState> {
    this.requireRecordingController(event);
    if (this.modeSwitch.switching()) throw new Error('Whisperer is switching servers. Try again in a moment.');
    if (this.erasingLocalData) throw new Error('On-device data is being deleted. Try again in a moment.');
    if (!['idle', 'error'].includes(this.recording.status)) throw new Error('A recording is already active.');
    if (this.meetingCapture) throw new Error('Stop the meeting recording before dictating.');
    this.captureTarget = null;
    this.shortcutRecordingMode = mode;
    // Reserve before any await so a concurrent start or cancellation sees the in-flight request.
    this.recording = { capturePhase: 'capturing', error: null, startedAt: new Date().toISOString(), status: 'starting' };
    this.showOverlay();
    this.publishState();
    const cancellationEpoch = this.recordingCancellationEpoch;
    try {
      await this.recordingCoordinator.prepareStart(
        async () => this.settings.get().autoPaste ? this.platform.captureTarget() : null,
        (target) => {
          this.captureTarget = target;
          this.emit(CHANNELS.events.recordingCommand, 'start');
          // A release during target lookup preceded hub capture; replay it after the start command.
          if (this.recording.status === 'stopping') this.emit(CHANNELS.events.recordingCommand, 'stop');
        },
      );
    } catch (error) {
      // A cancelled start already returned to idle and resolves quietly; a lookup failure releases the reservation.
      if (cancellationEpoch !== this.recordingCancellationEpoch) return this.recording;
      this.recording = { capturePhase: 'failed', error: safeMessage(error), startedAt: null, status: 'error' };
      this.publishState();
      throw error;
    }
    return this.recording;
  }

  /** Asks only the hub capture view to stop its recorder. */
  private async stopRecording(event?: IpcMainInvokeEvent): Promise<RecordingState> {
    this.requireRecordingController(event);
    if (!['starting', 'recording'].includes(this.recording.status)) throw new Error('No recording is active.');
    this.recording = { ...this.recording, capturePhase: 'captured', status: 'stopping' };
    this.emit(CHANNELS.events.recordingCommand, 'stop');
    this.publishState();
    return this.recording;
  }

  /** Cancels capture or upload, drops the saved paste target, and never publishes late output. */
  private async cancelRecording(event?: IpcMainInvokeEvent): Promise<RecordingState> {
    this.requireRecordingController(event);
    this.recordingCancellationEpoch += 1;
    this.recordingCoordinator.cancel();
    this.captureTarget = null;
    this.recording = { capturePhase: 'cancelled', error: null, startedAt: null, status: 'idle' };
    this.emit(CHANNELS.events.recordingCommand, 'cancel');
    this.publishState();
    return this.recording;
  }

  /** Sends an owned hub capture through the API with cancellation and records only a non-stale result. */
  private async submitRecording(submission: { audio: Uint8Array; durationMs: number; contentType: string; filename: string }, event: IpcMainInvokeEvent): Promise<{ historyEntry: HistoryEntry; capturePhase: 'submitted' | 'failed' }> {
    this.requireHub(event);
    if (submission.audio.byteLength > MAX_AUDIO_BYTES) throw new Error('Recording is too large.');
    this.recording = { ...this.recording, capturePhase: 'submitting', status: 'processing' };
    const submissionEpoch = this.recordingCancellationEpoch;
    this.publishState();
    try {
      const result = await this.recordingCoordinator.submit((signal) => this.api.transcribe(submission, signal));
      if (submissionEpoch !== this.recordingCancellationEpoch) throw new Error('Transcription cancelled');
      const snippets = this.store.listSnippets();
      const expanded = expandSpokenSnippets(result.text, snippets);
      const text = expanded.text;
      const rawText = 'rawText' in result && typeof result.rawText === 'string' ? result.rawText : result.text;
      for (const snippet of snippets) {
        const count = expanded.uses.get(snippet.id);
        if (count) this.store.saveSnippet({ ...snippet, useCount: snippet.useCount + count });
      }
      await clipboard.writeText(text);
      let pasted = false;
      if (this.settings.get().autoPaste) {
        const insertion = await this.platform.insertText(text, this.captureTarget);
        pasted = insertion.inserted;
        // Without this, a missing permission looks like dictation silently doing nothing.
        if (!pasted) this.logger.warn(`Dictation was copied but not pasted: ${insertion.reason ?? 'unknown reason'}`);
      }
      const entry: HistoryEntry = {
        appName: null, createdAt: new Date().toISOString(),
        dictionaryReplacements: 'dictionaryReplacements' in result && typeof result.dictionaryReplacements === 'number' ? result.dictionaryReplacements : 0,
        durationMs: submission.durationMs, id: randomUUID(), language: this.settings.get().language || 'en', pasted, rawText, status: 'completed', text,
      };
      this.store.addHistory({ ...entry, createdAt: Date.parse(entry.createdAt) });
      // The server applies dictionary substitutions during transcription; never apply them a second time locally.
      this.store.enqueueOutbox({
        attempts: 0, createdAt: Date.now(), entityId: entry.id, id: `metric:${entry.id}`,
        kind: 'metric', payload: JSON.stringify({
          id: entry.id, createdAt: entry.createdAt, durationMs: entry.durationMs,
          outputWords: wordCount(text), correctedWords: correctedWordCount(rawText, text),
          dictionaryReplacements: entry.dictionaryReplacements,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }),
      });
      // Refresh account totals after the outbox flush settles, not just after local history changes.
      void this.meetingSync.sync().then(() => this.emit(CHANNELS.events.historyChanged, undefined), () => undefined);
      this.recording = { capturePhase: 'submitted', error: null, startedAt: null, status: 'idle' };
      this.captureTarget = null;
      this.emit(CHANNELS.events.historyChanged, undefined);
      this.publishState();
      return { capturePhase: 'submitted', historyEntry: entry };
    } catch (error) {
      // A cancellation may race with HTTP completion; never resurrect it as an error or copy result.
      if (submissionEpoch === this.recordingCancellationEpoch) {
        this.recording = { capturePhase: 'failed', error: safeMessage(error), startedAt: null, status: 'error' };
        this.captureTarget = null;
        this.publishState();
      }
      throw error;
    }
  }

  /** Accepts only a legal hub-reported capture phase and reflects it to state subscribers. */
  private async reportPhase(report: { capturePhase: RecordingState['capturePhase']; error?: string }, event: IpcMainInvokeEvent): Promise<RecordingState> {
    this.requireHub(event);
    // A cancelled renderer may finish reporting after main has returned to idle.
    if (this.recording.status === 'idle' && ['failed', 'submitted'].includes(report.capturePhase)) return this.recording;
    const status = report.capturePhase === 'capturing'
      ? 'recording'
      : report.capturePhase === 'submitting'
        ? 'processing'
        : report.capturePhase === 'failed'
          ? 'error'
          : ['idle', 'submitted', 'cancelled'].includes(report.capturePhase)
            ? 'idle'
            : this.recording.status;
    this.recording = {
      ...this.recording,
      capturePhase: report.capturePhase,
      error: report.error ?? (status === 'error' ? 'Recording failed.' : null),
      startedAt: status === 'idle' || status === 'error' ? null : this.recording.startedAt,
      status,
    };
    this.publishState();
    return this.recording;
  }

  /** Returns platform facts already shaped as the canonical capability contract. */
  private async capabilities(): Promise<Capabilities> {
    const capabilities = await this.platform.capabilityStatus();
    return { ...capabilities, holdToTalk: this.holdShortcut.capability(), globalShortcut: this.holdShortcutRegistered ? { supported: true, granted: true, reason: null } : capabilities.globalShortcut };
  }

  /** Requests a supported platform permission without allowing the overlay or a subframe to prompt. */
  private async requestCapability(capability: CapabilityId): Promise<Capability> {
    if (capability !== 'microphone' && capability !== 'accessibility' && capability !== 'automation') return (await this.capabilities())[capability];
    const result = await this.platform.requestPermission(capability);
    if (result.ok && capability !== 'microphone') { this.registerShortcut(); this.publishState(); }
    const reported = (await this.capabilities())[capability];
    return { ...reported, granted: result.ok || reported.granted, reason: result.ok ? null : result.reason ?? reported.reason };
  }

  /** Returns local history with its display representation produced only in main process. */
  private history(): HistoryEntry[] {
    return this.store.listHistory().map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt).toISOString(), status: entry.status as HistoryEntry['status'] }));
  }

  /** Copies a local history display text only after looking it up under the active scope. */
  private async copyHistory(id: string): Promise<void> {
    const entry = this.history().find((candidate) => candidate.id === id);
    if (!entry) throw new Error('History entry was not found.');
    await clipboard.writeText(entry.text);
  }

  /** Refreshes server-backed notes when online while preserving visibly unsynced local drafts. */
  private async notes(): Promise<Note[]> {
    if (this.connected()) {
      try {
        const remoteNotes = await this.api.listNotes();
        const remoteIds = new Set(remoteNotes.map((note) => note.id));
        for (const remote of remoteNotes) {
          this.store.saveNote({
            content: remote.content,
            id: remote.id,
            pinned: remote.pinned ?? false,
            summary: remote.summary ?? '',
            syncState: 'synced',
            title: remote.title,
            updatedAt: Date.now(),
          });
        }
        // A server deletion must not survive indefinitely in the synced local cache.
        for (const local of this.store.listNotes()) {
          if (local.syncState === 'synced' && !remoteIds.has(local.id)) this.store.deleteNote(local.id);
        }
      } catch {
        // Offline mode intentionally returns local cache and drafts without clearing them.
      }
    }
    return this.store.listNotes().map((note) => toSharedNote(note, note.syncState !== 'synced'));
  }

  /** Resolves a renderer-held local draft identifier after its server-backed replacement. */
  private resolveNoteId(id: string | undefined): string | undefined {
    return id === undefined ? undefined : this.noteIdAliases.get(id) ?? id;
  }

  /** Saves an offline-safe local draft, then caches a successful server-backed note response. */
  private async saveNote(input: { id?: string; title: string; content: string; pinned?: boolean; localOnly?: boolean }): Promise<Note> {
    const id = this.resolveNoteId(input.id);
    const prior = id ? this.store.listNotes().find((note) => note.id === id) : undefined;
    let local = {
      content: input.content,
      id: id ?? randomUUID(),
      pinned: input.pinned ?? prior?.pinned ?? false,
      summary: prior?.summary ?? '',
      syncState: input.localOnly ? 'local' : 'pending',
      title: input.title,
      updatedAt: Date.now(),
    };
    this.store.saveNote(local);
    this.emit(CHANNELS.events.notesChanged, undefined);
    if (input.localOnly) return toSharedNote(local, true);
    try {
      // A local draft's id is not a server note id. Create it remotely before caching the returned id.
      const remoteInput = prior?.syncState === 'synced'
        ? { id, title: input.title, content: input.content, pinned: input.pinned }
        : { title: input.title, content: input.content, pinned: input.pinned };
      const remote = await this.api.saveNote(remoteInput);
      if (remote.id !== local.id) {
        this.noteIdAliases.set(local.id, remote.id);
        this.store.deleteNote(local.id);
      }
      local = {
        content: remote.content,
        id: remote.id,
        pinned: remote.pinned ?? local.pinned,
        summary: remote.summary ?? '',
        syncState: 'synced',
        title: remote.title,
        updatedAt: Date.now(),
      };
      this.store.saveNote(local);
      this.emit(CHANNELS.events.notesChanged, undefined);
    } catch {
      local = { ...local, syncState: 'error', updatedAt: Date.now() };
      this.store.saveNote(local);
      this.emit(CHANNELS.events.notesChanged, undefined);
    }
    return toSharedNote(local, false);
  }

  /** Deletes a local-only draft immediately or confirms deletion with the server before removing its cache. */
  private async deleteNote(id: string): Promise<void> {
    const resolvedId = this.resolveNoteId(id) ?? id;
    const note = this.store.listNotes().find((candidate) => candidate.id === resolvedId);
    if (!note) return;
    if (note.syncState === 'synced') await this.api.deleteNote(resolvedId);
    this.store.deleteNote(resolvedId);
    this.emit(CHANNELS.events.notesChanged, undefined);
  }

  /** Requests a server-generated summary only for a note that has synchronized successfully. */
  private async summarizeNote(id: string): Promise<Note> {
    const resolvedId = this.resolveNoteId(id) ?? id;
    const local = this.store.listNotes().find((candidate) => candidate.id === resolvedId);
    if (!local) throw new Error('Note was not found.');
    if (local.syncState !== 'synced') throw new Error('Sync this note before requesting a server summary.');
    const remote = await this.api.summarizeNote(resolvedId);
    const saved = { ...local, content: remote.content, summary: remote.summary ?? '', title: remote.title, updatedAt: Date.now() };
    this.store.saveNote(saved);
    this.emit(CHANNELS.events.notesChanged, undefined);
    return toSharedNote(saved, false);
  }

  /** Returns locally scoped reusable snippets. */
  private snippets(): Snippet[] {
    return this.store.listSnippets().map(({ updatedAt: _updatedAt, ...snippet }) => snippet);
  }

  /** Creates or updates a local reusable snippet. */
  private async saveSnippet(input: { id?: string; shortcut: string; text: string }): Promise<Snippet> {
    const prior = input.id ? this.store.listSnippets().find((snippet) => snippet.id === input.id) : undefined;
    const snippet = { id: input.id ?? randomUUID(), shortcut: input.shortcut, text: input.text, updatedAt: Date.now(), useCount: prior?.useCount ?? 0 };
    this.store.saveSnippet(snippet);
    return { id: snippet.id, shortcut: snippet.shortcut, text: snippet.text, useCount: snippet.useCount };
  }

  /** Returns a scoped meeting cache, opportunistically flushing durable work without blocking offline UI. */
  private async listMeetings(): Promise<Meeting[]> {
    if (this.connected()) await this.meetingSync.sync();
    return this.meetings();
  }

  /** Maps scoped durable cache data to the renderer-safe flattened meeting contract. */
  private meetings(): Meeting[] {
    return this.store.listMeetings().map((meeting) => this.toSharedMeeting(meeting));
  }

  /** Gets an existing scoped meeting cache record without contacting the renderer. */
  private async getMeeting(id: string): Promise<Meeting | null> {
    const scopeEpoch = this.meetingScopeEpoch;
    try { await this.meetingSync.refresh(id); }
    catch { /* Offline reads retain the scoped cache rather than inventing content. */ }
    if (scopeEpoch !== this.meetingScopeEpoch) return null;
    const meeting = this.store.getMeeting(id);
    return meeting ? this.toSharedMeeting(meeting) : null;
  }

  /** Converts one internal meeting cache record into public data without a filesystem path. */
  private toSharedMeeting(meeting: import('./storage/models').LocalMeeting): Meeting {
    const segments = this.store.listMeetingSegments(meeting.id);
    const hasSegmentAudio = segments.some((segment) => Boolean(segment.audioPath && existsSync(segment.audioPath)));
    return {
      durationMs: meeting.durationMs, endedAt: meeting.endedAt === undefined ? (meeting.status === 'complete' ? new Date(meeting.createdAt + meeting.durationMs).toISOString() : null) : meeting.endedAt === null ? null : new Date(meeting.endedAt).toISOString(),
      error: meeting.error ?? null, hasAudio: hasSegmentAudio || Boolean(meeting.audioPath && existsSync(meeting.audioPath)), historyEntryIds: meeting.historyEntryIds ?? [], id: meeting.id,
      revision: meeting.revision, startedAt: new Date(meeting.createdAt).toISOString(), summary: meeting.summary,
      summaryRevision: meeting.summaryRevision, summarySourceRevision: meeting.summarySourceRevision,
      summaryStale: meeting.summaryStale, summaryStatus: (meeting.summaryStatus ?? 'idle') as Meeting['summaryStatus'],
      syncState: (meeting.syncState ?? 'local') as Meeting['syncState'], title: meeting.title, transcript: meeting.transcript,
      transcriptRevision: meeting.transcriptRevision, transcriptStatus: (meeting.transcriptStatus ?? 'idle') as Meeting['transcriptStatus'],
    };
  }

  /** Saves only meeting metadata; it never contacts a nonexistent server meeting API. */
  private async saveMeeting(input: { id?: string; title: string; startedAt: string; endedAt?: string | null; durationMs: number; historyEntryIds?: string[] }): Promise<Meeting> {
    const id = input.id ?? randomUUID();
    if (this.meetingCapture?.id === id) throw new Error('Stop the recording before editing this meeting.');
    const prior = input.id ? this.store.listMeetings().find((meeting) => meeting.id === input.id) : undefined;
    // Editing metadata keeps the captured audio, duration and transcript fields owned by capture.
    this.store.saveMeeting(prior
      ? { ...prior, title: input.title, syncState: 'pending' }
      : { createdAt: Date.parse(input.startedAt), durationMs: input.durationMs, id, status: 'complete', summary: '', title: input.title, transcript: '', syncState: 'pending', transcriptStatus: 'idle', summaryStatus: 'idle' });
    if (!prior) this.meetingSync.queueCreate(this.store.getMeeting(id)!);
    else this.meetingSync.queueMetadata({ id, title: input.title, revision: prior.revision ?? 1 });
    await this.meetingSync.sync();
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    return this.meetings().find((meeting) => meeting.id === id)!;
  }

  /** Saves a revisioned text edit locally first, then retries it from the scoped durable outbox. */
  private async saveMeetingText(field: 'transcript' | 'summary', input: { id: string; text: string; revision: number }): Promise<Meeting> {
    const existing = this.store.getMeeting(input.id);
    if (!existing) throw new Error('Meeting was not found.');
    // The cached revision stays the server precondition until the backend acknowledges the edit.
    const update = field === 'transcript'
      ? { transcript: input.text, transcriptRevision: input.revision, summaryStale: existing.summary.length > 0, syncState: 'pending' }
      : { summary: input.text, summaryRevision: input.revision, syncState: 'pending' };
    this.store.saveMeeting({ ...existing, ...update, error: null });
    this.meetingSync.queueText(field === 'transcript' ? 'meeting-transcript' : 'meeting-summary', input);
    void this.meetingSync.sync().then(() => this.emit(CHANNELS.events.meetingsChanged, undefined)).catch(() => undefined);
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    return this.toSharedMeeting(this.store.getMeeting(input.id)!);
  }

  /** Flushes meeting edits before asking the backend about its saved authoritative text. */
  private async askMeetingQuestion(input: { id: string; question: string; transcriptRevision?: number; summaryRevision?: number }): Promise<MeetingQuestionAnswer> {
    if (!this.store.getMeeting(input.id)) throw new Error('Meeting was not found.');
    const scopeEpoch = this.meetingScopeEpoch;
    // Do not make an already acknowledged note wait behind unrelated meeting audio.
    if (this.store.getMeeting(input.id)?.syncState !== 'synced') await this.meetingSync.sync();
    if (scopeEpoch !== this.meetingScopeEpoch) throw new Error('The session changed.');
    const saved = this.store.getMeeting(input.id);
    if (!saved || saved.syncState !== 'synced') {
      throw new Error('Save is still syncing. Wait for it to finish before asking a question.');
    }
    const answer = await this.api.askMeetingQuestion({
      ...input,
      transcriptRevision: saved.transcriptRevision,
      summaryRevision: saved.summaryRevision,
    });
    // Account or backend changes must never carry an answer into the new scope.
    if (scopeEpoch !== this.meetingScopeEpoch) throw new Error('The session changed.');
    return answer;
  }

  /** Requests server regeneration and stores an explicit failed state when offline. */
  private async regenerateMeetingSummary(id: string): Promise<Meeting> {
    const existing = this.store.getMeeting(id);
    if (!existing) throw new Error('Meeting was not found.');
    const scopeEpoch = this.meetingScopeEpoch;
    try {
      const remote = await this.api.regenerateMeetingSummary(id);
      if (scopeEpoch !== this.meetingScopeEpoch) throw new Error('The session changed.');
      const merged = { ...existing, summary: remote.summary ?? existing.summary, summaryRevision: remote.summaryRevision, summarySourceRevision: remote.summarySourceRevision, summaryStale: remote.summaryStale, summaryStatus: remote.summaryStatus ?? 'running', syncState: 'synced', error: remote.error ?? null };
      this.store.saveMeeting(merged);
    } catch (error) {
      // A cancelled or replaced account must never receive a stale error/cache update.
      if (scopeEpoch !== this.meetingScopeEpoch) throw error;
      this.store.saveMeeting({ ...existing, summaryStatus: 'failed', syncState: 'error', error: safeMessage(error) });
    }
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    return this.toSharedMeeting(this.store.getMeeting(id)!);
  }

  /** Retries every pending durable operation for this account, then returns the requested cache record. */
  private async retryMeeting(id: string): Promise<Meeting> {
    if (!this.store.getMeeting(id)) throw new Error('Meeting was not found.');
    await this.meetingSync.sync();
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    return this.toSharedMeeting(this.store.getMeeting(id)!);
  }

  /** Explicitly flushes the scoped durable outbox and returns cached meeting records. */
  private async syncMeetings(): Promise<Meeting[]> {
    await this.meetingSync.sync();
    const meetings = this.meetings();
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    return meetings;
  }

  /** Starts a distinct local audio segment while preserving the existing meeting id and prior audio. */
  private async resumeMeeting(id: string, event: IpcMainInvokeEvent): Promise<MeetingCaptureState> {
    this.requireHub(event);
    if (this.meetingCapture) throw new Error('A meeting is already recording.');
    const meeting = this.store.getMeeting(id);
    if (!meeting) throw new Error('Meeting was not found.');
    if (!['idle', 'error'].includes(this.recording.status)) throw new Error('Finish the dictation before recording a meeting.');
    const segmentId = randomUUID();
    const directory = join(this.meetingAudioDirectory, this.store.scopeDirectory());
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, `${id}-${segmentId}.webm`);
    writeFileSync(file, new Uint8Array(), { flag: 'wx', mode: 0o600 });
    const createdAt = Date.now();
    this.store.saveMeeting({ ...meeting, status: 'recording', syncState: 'pending' });
    this.meetingSync.queueResume(id);
    this.store.saveMeetingSegment({ id: segmentId, meetingId: id, audioPath: file, contentType: 'audio/webm', createdAt, durationMs: 0, language: this.settings.get().language || 'en', status: 'recording' });
    this.meetingCapture = { id, title: meeting.title, status: 'starting', startedAt: new Date(createdAt).toISOString(), error: null, file, bytes: 0, createdAt, segmentId, contentType: 'audio/webm' };
    this.emit(CHANNELS.events.meetingCaptureCommand, { command: 'start', id, title: meeting.title });
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    this.publishState();
    return this.publicMeetingCapture()!;
  }

  /** Creates a private file and a local meeting, then asks the hub capture owner to record. */
  private async startMeeting(title: string, event?: IpcMainInvokeEvent): Promise<MeetingCaptureState> {
    this.requireHub(event);
    if (this.modeSwitch.switching()) throw new Error('Whisperer is switching servers. Try again in a moment.');
    if (this.erasingLocalData) throw new Error('On-device data is being deleted. Try again in a moment.');
    if (this.meetingCapture) throw new Error('A meeting is already recording.');
    if (!['idle', 'error'].includes(this.recording.status)) throw new Error('Finish the dictation before recording a meeting.');
    const id = randomUUID();
    const segmentId = randomUUID();
    const directory = join(this.meetingAudioDirectory, this.store.scopeDirectory());
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, `${id}-${segmentId}.webm`);
    // Exclusive creation refuses an existing path or a planted symlink.
    writeFileSync(file, new Uint8Array(), { flag: 'wx', mode: 0o600 });
    const createdAt = Date.now();
    const meetingTitle = title.trim() || `Meeting ${new Date(createdAt).toLocaleString()}`;
    const localMeeting = { id, title: meetingTitle, createdAt, durationMs: 0, transcript: '', summary: '', status: 'recording', audioPath: file, syncState: 'pending', transcriptStatus: 'pending', summaryStatus: 'idle' };
    this.store.saveMeeting(localMeeting);
    this.store.saveMeetingSegment({ id: segmentId, meetingId: id, audioPath: file, contentType: 'audio/webm', createdAt, durationMs: 0, language: this.settings.get().language || 'en', status: 'recording' });
    this.meetingSync.queueCreate(localMeeting);
    this.meetingCapture = { id, title: meetingTitle, status: 'starting', startedAt: new Date(createdAt).toISOString(), error: null, file, bytes: 0, createdAt, segmentId, contentType: 'audio/webm' };
    this.emit(CHANNELS.events.meetingCaptureCommand, { command: 'start', id, title: meetingTitle });
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    this.publishState();
    return this.publicMeetingCapture()!;
  }

  /** Asks the capture owner to stop; the owner then calls finish. */
  private async stopMeeting(event: IpcMainInvokeEvent): Promise<MeetingCaptureState | null> {
    this.requireRecordingController(event);
    const capture = this.meetingCapture;
    if (!capture) return null;
    capture.status = 'stopping';
    this.emit(CHANNELS.events.meetingCaptureCommand, { command: 'stop', id: capture.id, title: capture.title });
    this.publishState();
    return this.publicMeetingCapture();
  }

  /** Appends one bounded chunk to the active private meeting file. */
  private async appendMeeting({ id, audio }: { id: string; audio: Uint8Array }, event: IpcMainInvokeEvent): Promise<void> {
    this.requireHub(event);
    const capture = this.meetingCapture;
    if (!capture || capture.id !== id) throw new Error('This meeting recording is no longer active.');
    // Keep every segment uploadable: finish the meeting at the server's size cap or the on-device
    // two-hour limit instead of discarding it. Resume records the rest as a new segment.
    const decision = meetingChunkDecision(capture.bytes, audio.byteLength, Date.now() - capture.createdAt);
    if (decision.append) {
      appendFileSync(capture.file, audio);
      capture.bytes += audio.byteLength;
    }
    if (capture.status === 'starting') { capture.status = 'recording'; this.publishState(); }
    if (decision.stop && capture.status !== 'stopping') {
      this.logger.warn('Meeting recording reached the segment limit and was finished; Resume continues it.');
      capture.status = 'stopping';
      this.emit(CHANNELS.events.meetingCaptureCommand, { command: 'stop', id: capture.id, title: capture.title });
      this.publishState();
    }
  }

  /** Finalizes the active meeting file and its metadata. */
  private async finishMeeting({ id, durationMs, contentType }: { id: string; durationMs: number; contentType: string }, event: IpcMainInvokeEvent): Promise<Meeting> {
    this.requireHub(event);
    const capture = this.meetingCapture;
    if (!capture || capture.id !== id) throw new Error('This meeting recording is no longer active.');
    this.meetingCapture = null;
    if (capture.bytes === 0) {
      this.removeMeeting(capture.id, capture.file);
      this.publishState();
      throw new Error('No meeting audio was captured.');
    }
    finalizeCapture(this.store, this.meetingSync, capture, durationMs, contentType, this.settings.get().language || 'en', Date.now());
    void this.meetingSync.sync().then(() => this.emit(CHANNELS.events.meetingsChanged, undefined)).catch(() => undefined);
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    this.publishState();
    return this.meetings().find((meeting) => meeting.id === id)!;
  }

  /** Discards the active meeting, its partial file and its metadata. */
  private cancelMeeting(): void {
    const capture = this.meetingCapture;
    if (!capture) return;
    this.meetingCapture = null;
    this.emit(CHANNELS.events.meetingCaptureCommand, { command: 'cancel', id: capture.id, title: capture.title });
    try {
      if (this.isContainedMeetingAudio(capture.file) && existsSync(capture.file)) unlinkSync(capture.file);
      // A cancelled resume queues a finish, so the server does not keep the meeting open forever.
      if (!cancelCaptureRecords(this.store, this.meetingSync, capture)) void this.meetingSync.sync().catch(() => undefined);
    } catch (error) { this.logger.warn(`Meeting cleanup failed: ${safeMessage(error)}`); }
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    this.publishState();
  }

  /** Finishes the active meeting from the audio already on disk when the recorder cannot (quit, crash). */
  private finalizeActiveCapture(reason: string): void {
    const capture = this.meetingCapture;
    if (!capture) return;
    if (capture.bytes === 0) { this.cancelMeeting(); return; }
    this.meetingCapture = null;
    this.emit(CHANNELS.events.meetingCaptureCommand, { command: 'cancel', id: capture.id, title: capture.title });
    try {
      finalizeCapture(this.store, this.meetingSync, capture, Date.now() - capture.createdAt, capture.contentType, this.settings.get().language || 'en', Date.now());
      this.logger.warn(`A meeting recording ended because of ${reason}; the audio recorded so far was kept.`);
    } catch (error) { this.logger.warn(`Meeting finalize failed: ${safeMessage(error)}`); }
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    this.publishState();
  }

  /** Finishes segments a crash or forced quit left recording in the attached scope, keeping their audio. */
  private recoverMeetings(): void {
    if (this.meetingCapture || !this.store.hasScope()) return;
    try {
      const recovered = recoverInterruptedMeetings(
        this.store,
        this.meetingSync,
        (path) => {
          if (!this.isContainedMeetingAudio(path)) return null;
          const info = statSync(path);
          return { size: info.size, modifiedAt: info.mtimeMs };
        },
        (meetingId, segmentId, path) => {
          if (path && this.isContainedMeetingAudio(path)) rmSync(path, { force: true });
          this.store.deleteMeetingSegment(segmentId);
          this.store.discardOutboxForEntity(segmentId);
          if (this.store.listMeetingSegments(meetingId).length === 0) {
            this.store.discardOutboxForEntity(meetingId);
            this.store.deleteMeeting(meetingId);
          }
        },
      );
      if (recovered.length > 0) {
        this.logger.warn(`Recovered ${recovered.length} interrupted meeting recording(s).`);
        this.emit(CHANNELS.events.meetingsChanged, undefined);
      }
    } catch (error) { this.logger.warn(`Meeting recovery failed: ${safeMessage(error)}`); }
  }

  /** Deletes meeting metadata and its contained audio file. */
  private removeMeeting(id: string, file?: string): void {
    const audio = file ?? this.store.listMeetings().find((meeting) => meeting.id === id)?.audioPath;
    if (audio && this.isContainedMeetingAudio(audio) && existsSync(audio)) unlinkSync(audio);
    this.store.deleteMeeting(id);
  }

  /** Confirms a path is a regular file inside the private meeting audio directory. */
  private isContainedMeetingAudio(file: string): boolean {
    if (!existsSync(file) || lstatSync(file).isSymbolicLink()) return false;
    const root = realpathSync(this.meetingAudioDirectory);
    const target = realpathSync(file);
    const path = relative(root, target);
    return Boolean(path) && !path.startsWith('..') && !isAbsolute(path) && statSync(target).isFile();
  }

  /** Copies a user-selected audio file into private storage as a new local meeting. */
  private async importMeetingAudio(): Promise<Meeting | null> {
    const result = this.hub
      ? await dialog.showOpenDialog(this.hub, { properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['webm', 'wav', 'mp3', 'm4a', 'ogg'] }] })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['webm', 'wav', 'mp3', 'm4a', 'ogg'] }] });
    const source = result.filePaths[0];
    if (result.canceled || !source) return null;
    if (!statSync(source).isFile() || statSync(source).size > MEETING_SEGMENT_MAX_BYTES) throw new Error('Choose an audio file of 25 MB or less. Split a longer recording and import the parts.');
    const id = randomUUID();
    const segmentId = randomUUID();
    const extension = extname(source).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.audio';
    const directory = join(this.meetingAudioDirectory, this.store.scopeDirectory());
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, `${id}-${segmentId}${extension}`);
    copyFileSync(source, file);
    const createdAt = Date.now();
    const localMeeting = { id, title: basename(source, extname(source)).slice(0, 200) || 'Imported audio', createdAt, durationMs: 0, transcript: '', summary: '', status: 'complete', audioPath: file, syncState: 'pending', transcriptStatus: 'pending', summaryStatus: 'idle' };
    this.store.saveMeeting(localMeeting);
    this.store.saveMeetingSegment({ id: segmentId, meetingId: id, audioPath: file, contentType: mimeForAudioExtension(extension), createdAt, durationMs: 0, language: this.settings.get().language || 'en', status: 'pending' });
    this.meetingSync.queueCreate(localMeeting);
    this.meetingSync.queueSegment(id, segmentId);
    this.meetingSync.queueFinish(id);
    void this.meetingSync.sync().then(() => this.emit(CHANNELS.events.meetingsChanged, undefined)).catch(() => undefined);
    this.emit(CHANNELS.events.meetingsChanged, undefined);
    return this.meetings().find((meeting) => meeting.id === id) ?? null;
  }

  /** Saves a scoped meeting's contained audio to a user-selected destination. */
  private async exportMeetingAudio(id: string): Promise<void> {
    const audio = this.store.listMeetings().find((meeting) => meeting.id === id)?.audioPath;
    if (!audio || !this.isContainedMeetingAudio(audio)) throw new Error('This meeting has no local audio.');
    const options = { defaultPath: `meeting${extname(audio)}`, title: 'Export meeting audio' };
    const result = this.hub ? await dialog.showSaveDialog(this.hub, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;
    copyFileSync(audio, result.filePath);
  }

  /** Streams one signed-in account's completed local meeting audio, with byte ranges for seeking. */
  private serveMeetingAudio(request: Request, url: URL): Response {
    try {
      const id = decodeURIComponent(url.pathname.slice('/meeting-audio/'.length));
      if (!/^[0-9a-f-]{36}$/i.test(id) || this.meetingCapture?.id === id || !this.connected()) return new Response(null, { status: 404 });
      const meeting = this.store.getMeeting(id);
      const segmentAudio = this.store.listMeetingSegments(id).find((segment) => segment.audioPath && this.isContainedMeetingAudio(segment.audioPath))?.audioPath;
      // A single complete segment is playable; concatenating independent container files would corrupt codecs.
      const audio = segmentAudio ?? meeting?.audioPath;
      if (!audio || !this.isContainedMeetingAudio(audio)) return new Response(null, { status: 404 });
      const size = statSync(audio).size;
      const types: Record<string, string> = { '.webm': 'audio/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };
      const headers: Record<string, string> = { 'Accept-Ranges': 'bytes', 'Content-Type': types[extname(audio).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
      if (range && size > 0) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        const stream = Readable.toWeb(createReadStream(audio, { start, end })) as ReadableStream;
        return new Response(stream, { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` } });
      }
      return new Response(Readable.toWeb(createReadStream(audio)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(size) } });
    } catch {
      return new Response(null, { status: 404 });
    }
  }

  /** Returns the renderer-safe active meeting capture state. */
  private publicMeetingCapture(): MeetingCaptureState | null {
    const capture = this.meetingCapture;
    return capture ? { id: capture.id, title: capture.title, status: capture.status, startedAt: capture.startedAt, error: capture.error } : null;
  }

  /** Toggles the caller's owning window and returns its resulting state. */
  private toggleMaximize(event: IpcMainInvokeEvent): { maximized: boolean } {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('Application window was not found.');
    if (window.isMaximized()) window.unmaximize(); else window.maximize();
    return { maximized: window.isMaximized() };
  }

  /** Writes version facts and the redacted local log to a user-selected location and reveals it. */
  private async exportDiagnostics(): Promise<{ path: string | null }> {
    const options = { defaultPath: 'whisperer-diagnostics.json', title: 'Export diagnostics' };
    const result = this.hub ? await dialog.showSaveDialog(this.hub, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { path: null };
    let log = '';
    try { log = readFileSync(join(app.getPath('logs'), 'main.log'), 'utf8'); } catch { /* no log yet */ }
    // Version facts and the local log only: never dictation history, notes, meetings or snippets.
    const data = buildDiagnostics({
      exportedAt: new Date().toISOString(), appVersion: app.getVersion(), platform: process.platform, arch: process.arch,
      osRelease: release(), electron: process.versions.electron ?? '', connectionMode: this.deviceMode() ? 'device' : 'remote',
      capabilities: await this.capabilities(), log,
    });
    writeFileSync(result.filePath, data, { mode: 0o600 });
    shell.showItemInFolder(result.filePath);
    return { path: result.filePath };
  }

  /** Saves profile name fields only through the connected server's generated profile operation. */
  private async saveAccount(input: { displayName?: string; firstName?: string | null; lastName?: string | null }): Promise<NonNullable<BootstrapState['user']>> {
    if (this.deviceMode()) throw new Error('Profile names are not used in on-device mode.');
    if (input.displayName !== undefined && input.firstName === undefined && input.lastName === undefined) {
      throw new Error('Use first and last name fields with this server.');
    }
    const updated = await this.api.patchCurrentUser({ firstName: input.firstName, lastName: input.lastName });
    this.currentUser = updated;
    this.publishState();
    return this.publicUser()!;
  }

  /** Builds current public authentication state without token material. */
  private authState(): AuthState {
    return { settings: this.publicSettings(), user: this.publicUser() };
  }

  /** Converts service settings into the canonical shared renderer-safe representation. */
  private publicSettings(): PublicSettings {
    const settings = toPublicSettings(this.settings.get());
    // In on-device mode the visible server is the verified loopback address; the remote host stays saved for switching back.
    const shared = { ...settings, localServer: this.localServer.status(), runtimeInstalled: this.runtimeInstalled };
    return this.deviceMode() ? { ...shared, apiHost: this.localServer.connection()?.host ?? null } : shared;
  }

  /** Projects an API identity into the exact public contract. */
  private publicUser(): BootstrapState['user'] {
    return this.currentUser ? { displayName: this.currentUser.displayName ?? this.currentUser.email ?? 'Whisperer user', email: this.currentUser.email ?? null, id: this.currentUser.id } : null;
  }

  /** Clears local session scope, cancels in-flight transcription, and never retains cross-account data in memory. */
  private clearSession(): void {
    this.meetingScopeEpoch += 1;
    // Discard partial audio before the account scope disappears.
    this.cancelMeeting();
    this.recordingCancellationEpoch += 1;
    this.recordingCoordinator.cancel();
    this.captureTarget = null;
    this.currentUser = null;
    this.noteIdAliases.clear();
    this.store.setScope(null);
    this.recording = { capturePhase: 'idle', error: null, startedAt: null, status: 'idle' };
    // Signed out: hold hook and new-note shortcut unregister; dictation falls back to its toggle shortcut.
    this.registerShortcut();
    this.overlay?.hide();
    if (this.scratchpad && !this.scratchpad.isDestroyed()) this.scratchpad.close();
    this.publishState();
  }

  /** Sends one schema-validated main-to-renderer event to each still-owned application window. */
  private emit<C extends EventChannel>(channel: C, payload: unknown): void {
    const value = EVENT_RUNTIME_SPECS[channel].payload.parse(payload);
    for (const window of this.windows) if (!window.isDestroyed()) window.webContents.send(channel, value);
  }

  /** Publishes full safe state after state-changing main operations. */
  private publishState(): void {
    this.syncCancelShortcut();
    this.syncStatusBar();
    void this.bootstrap().then((state) => this.emit(CHANNELS.events.state, state)).catch(() => undefined);
  }

  /** Rejects audio upload and capture reports originating outside the one microphone-owning hub. */
  private requireHub(event?: IpcMainInvokeEvent): void {
    if (event && event.sender !== this.hub?.webContents) throw new Error('Audio capture is available only in the main hub.');
  }

  /** Allows hub, overlay, and native tray actions to control state without granting capture to scratchpad windows. */
  private requireRecordingController(event?: IpcMainInvokeEvent): void {
    if (event && event.sender !== this.hub?.webContents && event.sender !== this.overlay?.webContents) {
      throw new Error('Recording controls are unavailable in this window.');
    }
  }

  /** Maps internal failures to a short safe IPC envelope error. */
  private ipcError(error: unknown): { code: string; message: string } {
    if (error && typeof error === 'object' && 'issues' in error) return { code: 'BAD_REQUEST', message: 'The desktop request was invalid.' };
    const message = safeMessage(error);
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && PUBLIC_ERROR_CODES.has(error.code) ? error.code : null;
    return { code: code ?? (/already active|already in progress/i.test(message) ? 'CONFLICT' : 'INTERNAL'), message };
  }
}

/** Maps a scoped local note cache record to the renderer-safe note contract. */
function toSharedNote(note: { id: string; title: string; content: string; summary: string; updatedAt: number; pinned: boolean; syncState: string }, localOnly: boolean): Note {
  return {
    ...note,
    localOnly,
    summary: note.summary || null,
    syncState: note.syncState as Note['syncState'],
    updatedAt: new Date(note.updatedAt).toISOString(),
  };
}

/** Returns a conservative media type for imported audio file extensions. */
function mimeForAudioExtension(extension: string): string {
  return ({ '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'audio/webm' } as Record<string, string>)[extension] ?? 'application/octet-stream';
}

/** Converts the settings service's internal naming and empty defaults into the public IPC contract. */
function toPublicSettings(settings: ReturnType<SettingsService['get']>): PublicSettings {
  return {
    apiHost: settings.apiHost,
    authenticated: settings.authenticated,
    autoPaste: settings.autoPaste,
    holdToTalk: settings.holdToTalk,
    language: settings.language || 'en',
    launchAtLogin: settings.launchAtLogin,
    microphoneId: settings.microphoneId || null,
    onboardingCompleted: settings.onboardingCompleted,
    polish: settings.polish,
    retainAudio: settings.retainAudio,
    secureCredentials: settings.secureCredentials,
    shortcut: settings.shortcut,
    shortcutBindings: settings.shortcutBindings,
    theme: settings.theme,
    showStatusBar: settings.showStatusBar,
    syncAtStartup: settings.syncAtStartup,
    scratchpadInBar: settings.scratchpadInBar,
    scratchpadShortcut: settings.scratchpadShortcut,
    transformsEnabled: settings.transformsEnabled,
    autoAfterDictationTransform: settings.autoAfterDictationTransform,
    connectionMode: settings.connectionMode ?? 'remote',
    inference: settings.inference,
  };
}

/** Map Node's platform to a supported desktop family. Returns: Linux for any non-macOS, non-Windows Unix desktop. */
function desktopPlatform(): 'darwin' | 'win32' | 'linux' {
  return process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux';
}

/** Returns only an expected user-safe error message. */
function safeMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message.slice(0, 500) : 'The desktop operation could not be completed.';
}

/** Detects an explicit authorization failure while preserving a valid session after ordinary offline errors. */
function isUnauthorized(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'status' in error && (error as { status?: unknown }).status === 401);
}

if (process.env.WHISPERER_DESKTOP_DATA_DIR) {
  mkdirSync(process.env.WHISPERER_DESKTOP_DATA_DIR, { recursive: true, mode: 0o700 });
  app.setPath('userData', process.env.WHISPERER_DESKTOP_DATA_DIR);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let runtime: DesktopMainRuntime | null = null;
let pendingDeepLink: string | null = process.argv.find((argument) => argument.startsWith('whisperer:')) ?? null;
app.on('second-instance', (_event, commandLine) => {
  const deepLink = commandLine.find((argument) => argument.startsWith('whisperer:'));
  if (deepLink) runtime?.openDeepLink(deepLink);
  runtime?.showHub();
});
app.on('open-url', (event, rawUrl) => {
  event.preventDefault();
  if (runtime) runtime.openDeepLink(rawUrl);
  else pendingDeepLink = rawUrl;
});
app.on('activate', () => runtime?.showHub());
// Cmd+Q, menu quit and OS logout must close windows instead of hiding them to the tray.
app.on('before-quit', (event) => {
  runtime?.beginQuit();
  const current = runtime;
  if (!current || !current.needsLocalShutdown()) return;
  // Stop the owned on-device server before exit; if this process dies instead, the server exits on stdin EOF.
  event.preventDefault();
  void current.shutdownLocalServer().then(() => app.quit());
});
app.on('will-quit', () => runtime?.stop());
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !runtime?.hasTray()) app.quit(); });
app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  runtime = new DesktopMainRuntime();
  await runtime.start();
}).catch((error) => {
  const message = `Desktop startup failed: ${safeMessage(error)}`;
  new Logger(join(app.getPath('logs'), 'main.log')).error(message);
  // No window exists yet, so stderr is the only place a launch from a terminal can show the failure.
  console.error(message);
  app.quit();
});
