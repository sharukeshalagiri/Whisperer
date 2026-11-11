import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { randomUUID } from 'node:crypto';

import type { AutoAfterDictationTransform, ConnectionMode, DesktopPlatform, InferenceSettings, InferenceUpdate, PublicSettings, Theme, TransformDefinition, TransformDefinitionSaveInput } from '../../shared/contracts';
import { defaultShortcutBindings, migrateShortcutBindings, normalizeShortcut, SHORTCUT_ACTION_IDS, shortcutConflict, validateShortcut } from '../../shared/shortcuts';
import type { ShortcutBindings } from '../../shared/shortcuts';
import { connectionModeSchema, defaultInferenceSettings, inferenceSettingsSchema, shortcutBindingsSchema } from '../../shared/protocol';

/** Defines Electron safe-storage capabilities needed for credential persistence. */
export interface SafeStorage {
  decryptString(value: Buffer): string;
  encryptString(value: string): Buffer;
  getSelectedStorageBackend?(): string;
  isEncryptionAvailable(): boolean;
}

/** Defines the redacted logger surface used by the settings boundary. */
export interface SettingsLogger {
  warn(message: string): void;
}

/** Holds the application tokens that never cross the main-process boundary. */
export interface ApplicationSession {
  accessToken: string;
  refreshToken: string;
}

/** Holds user-editable desktop-only preferences. */
export interface SettingsPreferences {
  autoPaste: boolean;
  holdToTalk: boolean;
  language: string;
  launchAtLogin: boolean;
  checkUpdatesAutomatically: boolean;
  microphoneId: string;
  onboardingCompleted: boolean;
  polish: boolean;
  retainAudio: boolean;
  shortcut: string;
  theme: Theme;
  showStatusBar: boolean;
  /** Whether the on-device and signed-in remote data sync when the on-device server starts. */
  syncAtStartup: boolean;
  scratchpadInBar: boolean;
  scratchpadShortcut: string;
  shortcutBindings: ShortcutBindings;
  transformsEnabled: boolean;
  autoAfterDictationTransform: AutoAfterDictationTransform;
  transforms: TransformDefinition[];
}

/** Configures a SettingsService instance. */
export interface SettingsServiceOptions {
  directory: string;
  platform?: DesktopPlatform;
  logger?: SettingsLogger;
  safeStorage: SafeStorage;
}

type PersistedSettings = Partial<SettingsPreferences> & {
  apiHost?: string | null;
  /** Account id the last verified session belonged to; not a secret. */
  sessionUserId?: string | null;
  encryptedSession?: string;
  connectionMode?: ConnectionMode;
  inference?: InferenceSettings;
  encryptedInferenceKeys?: string;
};

/** Provider keys for the on-device server, held only in main and OS-encrypted at rest. */
export interface InferenceSecrets {
  speechApiKey: string;
  llmApiKey: string;
}

const DEFAULT_PREFERENCES: Readonly<SettingsPreferences> = Object.freeze({
  autoPaste: true,
  holdToTalk: false,
  language: '',
  launchAtLogin: false,
  checkUpdatesAutomatically: false,
  microphoneId: '',
  onboardingCompleted: false,
  polish: false,
  retainAudio: false,
  shortcut: 'Control+Alt+Space',
  theme: 'system',
  showStatusBar: true,
  syncAtStartup: false,
  scratchpadInBar: false,
  scratchpadShortcut: 'Alt+S',
  shortcutBindings: defaultShortcutBindings(),
  transformsEnabled: true,
  autoAfterDictationTransform: { active: false, definitionId: 'polish' },
  transforms: [],
});

/** Returns the built-in transforms with portable platform defaults. */
export function defaultTransformDefinitions(platform: DesktopPlatform): TransformDefinition[] {
  const modifier = platform === 'win32' ? 'Super+Alt' : 'Alt';
  return [
    { id: 'polish', name: 'Polish', prompt: 'Polish this text for clarity and natural grammar. Preserve its meaning, voice, facts, and formatting. Return only the revised text.', shortcut: `${modifier}+1`, builtIn: true },
    { id: 'prompt-engineer', name: 'Prompt Engineer', prompt: 'Turn this into a precise, usable prompt. Make the objective, context, inputs, constraints, expected output, and success checks explicit. Preserve intent and return only the improved prompt.', shortcut: `${modifier}+4`, builtIn: true },
    { id: 'decompose', name: 'Decompose', prompt: 'Break this into a clear, actionable structure. Preserve all important details and organize it into concise steps or sections. Return only the restructured text.', shortcut: `${modifier}+2`, builtIn: true },
  ];
}

/** Creates fresh preferences with shortcuts appropriate for the current platform. */
function defaultPreferences(platform: DesktopPlatform): SettingsPreferences {
  const shortcutBindings = defaultShortcutBindings(platform);
  return { ...DEFAULT_PREFERENCES, shortcutBindings, shortcut: shortcutBindings.toggleRecording[0] ?? '', transforms: defaultTransformDefinitions(platform) };
}

/** Persists local preferences and holds safe-storage-protected application credentials. */
export class SettingsService {
  private apiHost: string | null = null;
  private sessionUserId: string | null = null;

  private readonly file: string;

  private preferences: SettingsPreferences;

  private session: ApplicationSession | null = null;

  private connectionMode: ConnectionMode = 'remote';

  private inference: InferenceSettings = defaultInferenceSettings();

  private inferenceKeys: InferenceSecrets = { speechApiKey: '', llmApiKey: '' };

  /** Creates a service and recovers valid persisted desktop state without exposing credentials. */
  constructor(private readonly options: SettingsServiceOptions) {
    this.preferences = defaultPreferences(this.platform);
    this.file = join(options.directory, 'settings.json');
    this.load();
  }

  /** Resolve the platform for portable binding defaults and aliases. */
  private get platform(): DesktopPlatform {
    return this.options.platform ?? (process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux');
  }

  /** Reports whether credentials may be written through an OS-backed encryption provider. */
  canPersistCredentials(): boolean {
    return this.options.safeStorage.isEncryptionAvailable() && this.options.safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  }

  /** Returns public settings without access or refresh token values. */
  get(): PublicSettings {
    const { transforms: _transforms, ...publicPreferences } = this.preferences;
    return {
      ...publicPreferences,
      shortcutBindings: migrateShortcutBindings(this.preferences, this.platform),
      apiHost: this.apiHost,
      authenticated: this.session !== null,
      secureCredentials: this.canPersistCredentials(),
      connectionMode: this.connectionMode,
      inference: structuredClone(this.inference),
    };
  }

  /** Persists the selected backend. Sign-in state is kept separately and is not changed. */
  setConnectionMode(mode: ConnectionMode): void {
    this.connectionMode = connectionModeSchema.parse(mode);
    this.persist();
  }

  /** Returns decrypted provider keys for the on-device server's private stdin. Never send these to a renderer. */
  inferenceSecrets(): InferenceSecrets {
    return { ...this.inferenceKeys };
  }

  /**
   * Saves inference settings. An omitted key keeps the saved one, an empty key removes it,
   * and switching an engine away from HTTP discards its key.
   */
  updateInference(update: InferenceUpdate): InferenceSettings {
    const next = structuredClone(this.inference);
    const keys = { ...this.inferenceKeys };
    if (update.speech) {
      if (update.speech.provider === 'onnx') {
        next.speech = { provider: 'onnx', model: update.speech.model };
        keys.speechApiKey = '';
      } else {
        // A saved key belongs to one endpoint host and is never sent to a different one.
        if (this.inference.speech.provider !== 'http' || hostOf(this.inference.speech.baseUrl) !== hostOf(update.speech.baseUrl)) keys.speechApiKey = '';
        if (update.speech.apiKey !== undefined) keys.speechApiKey = update.speech.apiKey;
        next.speech = { provider: 'http', baseUrl: update.speech.baseUrl, model: update.speech.model, hasApiKey: keys.speechApiKey !== '' };
      }
    }
    if (update.llm) {
      if (update.llm.provider === 'off') {
        next.llm = { provider: 'off' };
        keys.llmApiKey = '';
      } else {
        if (this.inference.llm.provider !== 'http' || hostOf(this.inference.llm.baseUrl) !== hostOf(update.llm.baseUrl)) keys.llmApiKey = '';
        if (update.llm.apiKey !== undefined) keys.llmApiKey = update.llm.apiKey;
        next.llm = { provider: 'http', baseUrl: update.llm.baseUrl, model: update.llm.model, hasApiKey: keys.llmApiKey !== '' };
      }
    }
    this.inference = inferenceSettingsSchema.parse(next) as InferenceSettings;
    this.inferenceKeys = keys;
    this.persist();
    return structuredClone(this.inference);
  }

  /** Lists local definitions without exposing any process-only state. */
  listTransforms(): TransformDefinition[] {
    return this.preferences.transforms.map((definition) => ({ ...definition }));
  }

  /** Creates or replaces one user-owned transform definition. */
  saveTransform(input: TransformDefinitionSaveInput): TransformDefinition {
    const id = input.id ?? `custom-${randomUUID()}`;
    const existing = this.preferences.transforms.find((definition) => definition.id === id);
    if (input.id && !existing) throw new TypeError('This transform no longer exists.');
    if (!existing && this.preferences.transforms.length >= 9) throw new TypeError('You can save up to 9 transforms.');
    const definition: TransformDefinition = {
      id,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      shortcut: input.shortcut ? normalizeShortcut(input.shortcut, this.platform) : '',
      builtIn: existing?.builtIn ?? false,
    };
    const transforms = existing
      ? this.preferences.transforms.map((item) => item.id === id ? definition : item)
      : [...this.preferences.transforms, definition];
    const shortcutBindings = id === 'polish'
      ? { ...this.preferences.shortcutBindings, transform: definition.shortcut ? [definition.shortcut] : [] }
      : this.preferences.shortcutBindings;
    this.assertPreferences({ transforms, shortcutBindings });
    this.preferences = { ...this.preferences, transforms, shortcutBindings };
    this.persist();
    return { ...definition };
  }

  /** Deletes a custom definition; built-ins are intentionally restored through reset. */
  deleteTransform(id: string): void {
    const existing = this.preferences.transforms.find((definition) => definition.id === id);
    if (!existing) return;
    if (existing.builtIn) throw new TypeError('Built-in transforms can be reset but not deleted.');
    this.preferences = {
      ...this.preferences,
      transforms: this.preferences.transforms.filter((definition) => definition.id !== id),
      autoAfterDictationTransform: this.preferences.autoAfterDictationTransform.definitionId === id
        ? { ...this.preferences.autoAfterDictationTransform, active: false, definitionId: 'polish' }
        : this.preferences.autoAfterDictationTransform,
    };
    this.persist();
  }

  /** Restores authored defaults and deliberately removes every custom definition. */
  resetTransforms(): TransformDefinition[] {
    const transforms = this.availableDefaultTransforms(this.preferences.shortcutBindings);
    const polish = transforms.find((definition) => definition.id === 'polish');
    const reset = { transforms, shortcutBindings: { ...this.preferences.shortcutBindings, transform: polish?.shortcut ? [polish.shortcut] : [] } };
    this.assertPreferences(reset);
    this.preferences = { ...this.preferences, ...reset };
    const chosen = this.preferences.autoAfterDictationTransform.definitionId;
    if (!this.preferences.transforms.some((definition) => definition.id === chosen)) {
      this.preferences.autoAfterDictationTransform = { ...this.preferences.autoAfterDictationTransform, definitionId: 'polish' };
    }
    this.persist();
    return this.listTransforms();
  }

  /** Returns an internal copy of the current application session, if one exists. */
  getSession(): ApplicationSession | null {
    return this.session ? { ...this.session } : null;
  }

  /** Returns the normalized signed-in host or throws when sign-in has not completed. */
  requireApiHost(): string {
    if (!this.apiHost) throw new Error('Enter your Whisperer server URL');
    return this.apiHost;
  }

  /** Validates and normalizes a user-entered HTTP(S) API host. */
  normalizeApiHost(value: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError('Enter your Whisperer server URL');

    let url: URL;
    try {
      url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    } catch {
      throw new TypeError('Enter a valid Whisperer server URL');
    }

    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
      throw new TypeError('Enter a valid Whisperer server URL');
    }

    const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
    if (url.protocol === 'http:' && !localHosts.has(url.hostname)) throw new TypeError('Use HTTPS for a remote server');

    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (url.pathname.endsWith('/v1')) url.pathname = url.pathname.slice(0, -3) || '/';
    return url.href.replace(/\/$/, '');
  }

  /** Updates user-editable desktop preferences and returns their public representation. */
  update(update: Partial<SettingsPreferences>): PublicSettings {
    const next = { ...update };
    if (next.autoAfterDictationTransform?.active) throw new TypeError('Automatic transforms are not available on this device yet.');
    if (!next.shortcutBindings && ('shortcut' in next || 'holdToTalk' in next || 'scratchpadShortcut' in next)) {
      const bindings = migrateShortcutBindings(this.preferences, this.platform);
      const hold = next.holdToTalk ?? this.preferences.holdToTalk;
      if (next.shortcut !== undefined || next.holdToTalk !== undefined) {
        const shortcut = next.shortcut ?? this.preferences.shortcut;
        const action = hold ? 'holdToTalk' : 'toggleRecording';
        const other = hold ? 'toggleRecording' : 'holdToTalk';
        bindings[other] = bindings[other].filter((entry) => entry !== shortcut);
        bindings[action] = shortcut ? [shortcut] : [];
      }
      if (next.scratchpadShortcut !== undefined) bindings.scratchpad = next.scratchpadShortcut ? [next.scratchpadShortcut] : [];
      next.shortcutBindings = bindings;
    }
    if (next.shortcutBindings) {
      const polishShortcut = next.shortcutBindings.transform[0] ?? '';
      next.transforms = this.preferences.transforms.map((definition) => definition.id === 'polish' ? { ...definition, shortcut: polishShortcut } : definition);
    }
    this.assertPreferences(next);
    if (next.shortcutBindings) {
      const bindings = next.shortcutBindings;
      for (const action of SHORTCUT_ACTION_IDS) for (const value of bindings[action]) {
        const error = this.preferences.shortcutBindings[action].includes(value) ? null : validateShortcut(value, this.platform);
        if (error) throw new TypeError(error);
        if (shortcutConflict(bindings, action, value, this.platform)) throw new TypeError('This shortcut is already in use');
      }
      next.shortcut = bindings[(next.holdToTalk ?? this.preferences.holdToTalk) ? 'holdToTalk' : 'toggleRecording'][0] ?? '';
      next.scratchpadShortcut = bindings.scratchpad[0] ?? '';
    }
    this.preferences = { ...this.preferences, ...next };
    this.persist();
    return this.get();
  }

  /** Saves a verified host with a validated in-memory session. */
  setConnection(apiHost: string, session: ApplicationSession): void {
    const normalized = this.normalizeApiHost(apiHost);
    if (normalized !== this.apiHost) this.sessionUserId = null;
    this.apiHost = normalized;
    this.session = this.validateSession(session);
    this.persist();
  }

  /** Replaces current credentials or clears the complete connection during sign-out. */
  setSession(session: ApplicationSession | null): void {
    this.session = session ? this.validateSession(session) : null;
    if (!session) { this.apiHost = null; this.sessionUserId = null; }
    this.persist();
  }

  /** Records which account the current session verified as, so a later offline launch can open its cache. */
  rememberSessionUser(userId: string): void {
    if (!this.session || this.sessionUserId === userId) return;
    this.sessionUserId = userId;
    this.persist();
  }

  /** The account the saved session last verified as, or null. */
  getSessionUserId(): string | null { return this.session ? this.sessionUserId : null; }

  /** Loads new-format state, falling back to the legacy connection file one time. */
  private load(): void {
    const legacyFile = join(this.options.directory, 'connection.json');
    const source = existsSync(this.file) ? this.file : legacyFile;
    if (!existsSync(source)) return;

    let saved: PersistedSettings;
    try {
      saved = JSON.parse(readFileSync(source, 'utf8')) as PersistedSettings;
    } catch {
      this.options.logger?.warn('Settings file was unreadable; starting with defaults');
      return;
    }

    try {
      this.applyPersisted(saved);
      if (source === legacyFile) this.persist();
    } catch {
      this.preferences = defaultPreferences(this.platform);
      this.apiHost = null;
      this.sessionUserId = null;
      this.session = null;
      this.connectionMode = 'remote';
      this.inference = defaultInferenceSettings();
      this.inferenceKeys = { speechApiKey: '', llmApiKey: '' };
      this.options.logger?.warn('Settings file contained invalid values; starting with defaults');
    }
  }

  /** Validates persisted public fields and restores credentials only from secure storage. */
  private applyPersisted(saved: PersistedSettings): void {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new TypeError('Invalid settings');
    const preferences: Partial<SettingsPreferences> = {};
    for (const key of Object.keys(DEFAULT_PREFERENCES) as Array<keyof SettingsPreferences>) {
      if (key in saved) preferences[key] = saved[key] as never;
    }
    // Automatic post-dictation replacement has no safe target contract yet; retain the selected preset but fail closed.
    if (preferences.autoAfterDictationTransform?.active) preferences.autoAfterDictationTransform = { ...preferences.autoAfterDictationTransform, active: false };
    // Legacy generic Transform bindings become the primary Polish shortcut rather than a second registration.
    if (!Array.isArray(saved.transforms) && preferences.shortcutBindings) {
      const transformShortcut = preferences.shortcutBindings.transform[0];
      if (transformShortcut) preferences.transforms = defaultTransformDefinitions(this.platform).map((definition) => definition.id === 'polish' ? { ...definition, shortcut: normalizeShortcut(transformShortcut, this.platform) } : definition);
    }
    if (Array.isArray(preferences.transforms) && preferences.shortcutBindings) {
      const polishShortcut = preferences.transforms.find((definition) => definition.id === 'polish')?.shortcut ?? '';
      preferences.shortcutBindings = { ...preferences.shortcutBindings, transform: polishShortcut ? [polishShortcut] : [] };
    }
    try {
      this.assertPreferences(preferences);
    } catch {
      // A transform collision must not discard the account, so fall back to defaults that avoid saved actions.
      const bindings = migrateShortcutBindings(preferences, this.platform);
      preferences.transforms = this.availableDefaultTransforms(bindings);
      const polishShortcut = preferences.transforms.find((definition) => definition.id === 'polish')?.shortcut ?? '';
      preferences.shortcutBindings = { ...bindings, transform: polishShortcut ? [polishShortcut] : [] };
      this.assertPreferences(preferences);
      this.options.logger?.warn('Saved transforms conflicted with other shortcuts; restored transform defaults');
    }
    this.preferences = { ...defaultPreferences(this.platform), ...preferences, shortcutBindings: migrateShortcutBindings(preferences, this.platform) };
    this.apiHost = saved.apiHost == null ? null : this.normalizeApiHost(saved.apiHost);
    this.sessionUserId = typeof saved.sessionUserId === 'string' && saved.sessionUserId.length > 0 && saved.sessionUserId.length <= 200 ? saved.sessionUserId : null;
    this.applyPersistedDevice(saved);

    if (this.apiHost && typeof saved.encryptedSession === 'string' && this.canPersistCredentials()) {
      try {
        this.session = this.parseSession(this.options.safeStorage.decryptString(Buffer.from(saved.encryptedSession, 'base64')));
      } catch {
        this.session = null;
        this.options.logger?.warn('Saved credentials were unreadable; signing out locally');
      }
    }
  }

  /** Restores mode, inference and encrypted keys; an invalid value falls back alone without touching the session. */
  private applyPersistedDevice(saved: PersistedSettings): void {
    const mode = connectionModeSchema.safeParse(saved.connectionMode);
    this.connectionMode = mode.success ? mode.data : 'remote';
    const inference = inferenceSettingsSchema.safeParse(saved.inference);
    this.inference = inference.success ? inference.data as InferenceSettings : defaultInferenceSettings();
    if (saved.inference !== undefined && !inference.success) this.options.logger?.warn('Saved inference settings were invalid; using defaults');
    this.inferenceKeys = { speechApiKey: '', llmApiKey: '' };
    if (typeof saved.encryptedInferenceKeys === 'string' && this.canPersistCredentials()) {
      try {
        const parsed = JSON.parse(this.options.safeStorage.decryptString(Buffer.from(saved.encryptedInferenceKeys, 'base64'))) as Partial<InferenceSecrets>;
        this.inferenceKeys = {
          speechApiKey: this.inference.speech.provider === 'http' && typeof parsed.speechApiKey === 'string' ? parsed.speechApiKey : '',
          llmApiKey: this.inference.llm.provider === 'http' && typeof parsed.llmApiKey === 'string' ? parsed.llmApiKey : '',
        };
      } catch {
        this.options.logger?.warn('Saved inference keys were unreadable; enter them again');
      }
    }
    if (this.inference.speech.provider === 'http') this.inference.speech.hasApiKey = this.inferenceKeys.speechApiKey !== '';
    if (this.inference.llm.provider === 'http') this.inference.llm.hasApiKey = this.inferenceKeys.llmApiKey !== '';
  }

  /**
   * Returns built-in transforms without shortcuts that another action already uses.
   *
   * Args:
   *   bindings: The action bindings the defaults must not collide with.
   * Returns:
   *   Built-in definitions. A colliding shortcut is left empty for the user to choose.
   */
  private availableDefaultTransforms(bindings: ShortcutBindings): TransformDefinition[] {
    const taken = new Set(SHORTCUT_ACTION_IDS.filter((action) => action !== 'transform')
      .flatMap((action) => bindings[action].map((shortcut) => normalizeShortcut(shortcut, this.platform))));
    return defaultTransformDefinitions(this.platform).map((definition) =>
      definition.shortcut && taken.has(normalizeShortcut(definition.shortcut, this.platform)) ? { ...definition, shortcut: '' } : definition);
  }

  /** Validates a transform definition and every shortcut collision against its peers and actions. */
  private assertTransform(definition: TransformDefinition, replacingId?: string, bindings = this.preferences.shortcutBindings, transforms = this.preferences.transforms): void {
    if (!/^(?:polish|prompt-engineer|decompose|custom-[a-zA-Z0-9-]+)$/.test(definition.id)
      || !definition.name || definition.name.length > 80 || !definition.prompt || definition.prompt.length > 2000) {
      throw new TypeError('Invalid transform definition.');
    }
    if (!definition.shortcut) return;
    const shortcutError = validateShortcut(definition.shortcut, this.platform);
    if (shortcutError) throw new TypeError(shortcutError);
    const normalized = normalizeShortcut(definition.shortcut, this.platform);
    const normalizedBindings = bindings;
    if (SHORTCUT_ACTION_IDS.some((action) => action !== 'transform' && normalizedBindings[action].some((shortcut) => normalizeShortcut(shortcut, this.platform) === normalized))
      || (definition.id !== 'polish' && normalizedBindings.transform.some((shortcut) => normalizeShortcut(shortcut, this.platform) === normalized))) {
      throw new TypeError('This shortcut is already in use.');
    }
    if (transforms.some((item) => item.id !== replacingId && item.shortcut && normalizeShortcut(item.shortcut, this.platform) === normalized)) {
      throw new TypeError('This shortcut is already in use.');
    }
  }

  /** Rejects unknown or malformed user-editable preference values. */
  private assertPreferences(update: Partial<SettingsPreferences>): void {
    if (!update || typeof update !== 'object' || Array.isArray(update)) throw new TypeError('Invalid settings update');
    for (const key of Object.keys(update)) {
      if (!(key in DEFAULT_PREFERENCES)) throw new TypeError(`Unknown preference: ${key}`);
    }
    const candidate = { ...this.preferences, ...update };
    shortcutBindingsSchema.parse(candidate.shortcutBindings);
    if (!Array.isArray(candidate.transforms) || candidate.transforms.length > 9 || new Set(candidate.transforms.map((definition) => definition.id)).size !== candidate.transforms.length) throw new TypeError('Invalid transform definitions');
    for (const definition of candidate.transforms) this.assertTransform(definition, definition.id, candidate.shortcutBindings, candidate.transforms);
    for (const action of SHORTCUT_ACTION_IDS) for (const shortcut of candidate.shortcutBindings[action]) {
      if (candidate.transforms.some((definition) => definition.shortcut && normalizeShortcut(definition.shortcut, this.platform) === normalizeShortcut(shortcut, this.platform) && !(action === 'transform' && definition.id === 'polish'))) throw new TypeError('This shortcut is already in use.');
    }
    if (!candidate.autoAfterDictationTransform || typeof candidate.autoAfterDictationTransform.active !== 'boolean'
      || (candidate.autoAfterDictationTransform.definitionId !== null && typeof candidate.autoAfterDictationTransform.definitionId !== 'string')) throw new TypeError('Invalid automatic transform');
    if (typeof candidate.autoPaste !== 'boolean' || typeof candidate.holdToTalk !== 'boolean'
      || typeof candidate.launchAtLogin !== 'boolean' || typeof candidate.onboardingCompleted !== 'boolean'
      || typeof candidate.checkUpdatesAutomatically !== 'boolean'
      || typeof candidate.polish !== 'boolean' || typeof candidate.retainAudio !== 'boolean'
      || typeof candidate.showStatusBar !== 'boolean' || typeof candidate.scratchpadInBar !== 'boolean'
      || typeof candidate.syncAtStartup !== 'boolean') {
      throw new TypeError('Invalid preference flags');
    }
    if (typeof candidate.language !== 'string' || candidate.language.length > 32
      || typeof candidate.microphoneId !== 'string' || candidate.microphoneId.length > 512
      || typeof candidate.shortcut !== 'string' || candidate.shortcut.length > 100
      || typeof candidate.scratchpadShortcut !== 'string' || candidate.scratchpadShortcut.length > 100
      || (candidate.scratchpadShortcut !== '' && candidate.scratchpadShortcut === candidate.shortcut)
      || !['dark', 'light', 'system'].includes(candidate.theme)) {
      throw new TypeError('Invalid settings preference');
    }
  }

  /** Parses and validates the only credential shape retained by this service. */
  private parseSession(value: string): ApplicationSession {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new TypeError('Invalid encrypted application session');
    }
    return this.validateSession(parsed);
  }

  /** Validates an opaque access and refresh-token pair without logging either value. */
  private validateSession(session: unknown): ApplicationSession {
    if (!session || typeof session !== 'object' || Array.isArray(session)) throw new TypeError('Invalid application session');
    const candidate = session as Partial<ApplicationSession>;
    if (typeof candidate.accessToken !== 'string' || !candidate.accessToken
      || typeof candidate.refreshToken !== 'string' || !candidate.refreshToken) {
      throw new TypeError('Invalid application session');
    }
    return { accessToken: candidate.accessToken, refreshToken: candidate.refreshToken };
  }

  /** Atomically persists public settings plus encrypted credentials when secure storage permits it. */
  private persist(): void {
    const saved: PersistedSettings = { ...this.preferences, apiHost: this.apiHost, sessionUserId: this.sessionUserId, connectionMode: this.connectionMode, inference: this.inference };
    if (this.session && this.canPersistCredentials()) {
      try {
        saved.encryptedSession = this.options.safeStorage.encryptString(JSON.stringify(this.session)).toString('base64');
      } catch {
        this.options.logger?.warn('Credentials could not be encrypted; retaining them only in memory');
      }
    }
    if ((this.inferenceKeys.speechApiKey || this.inferenceKeys.llmApiKey) && this.canPersistCredentials()) {
      try {
        saved.encryptedInferenceKeys = this.options.safeStorage.encryptString(JSON.stringify(this.inferenceKeys)).toString('base64');
      } catch {
        this.options.logger?.warn('Inference keys could not be encrypted; retaining them only in memory');
      }
    }
    mkdirSync(this.options.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(saved, null, 2), { encoding: 'utf8', mode: 0o600 });
      renameSync(temporary, this.file);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
}

/** Returns the scheme and host of an endpoint, or an empty string when it is not a URL. */
function hostOf(value: string): string {
  try { const url = new URL(value); return `${url.protocol}//${url.host}`; } catch { return ''; }
}
