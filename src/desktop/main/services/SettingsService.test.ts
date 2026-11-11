import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { defaultShortcutBindings } from '../../shared/shortcuts';
import { SettingsService } from './SettingsService';

interface FakeSafeStorage {
  decryptString(value: Buffer): string;
  encryptString(value: string): Buffer;
  getSelectedStorageBackend(): string;
  isEncryptionAvailable(): boolean;
}

/** Creates an in-memory safe-storage replacement for isolated settings tests. */
function createSafeStorage(backend = 'keychain'): FakeSafeStorage {
  return {
    decryptString: (value) => value.toString('utf8'),
    encryptString: (value) => Buffer.from(value, 'utf8'),
    getSelectedStorageBackend: () => backend,
    isEncryptionAvailable: () => backend !== 'unavailable',
  };
}

const directories: string[] = [];

/** Creates a service with a unique on-disk preferences directory. */
function createSettings(backend = 'keychain') {
  const directory = mkdtempSync(join(tmpdir(), 'whisperer-settings-'));
  directories.push(directory);
  return { directory, settings: new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage(backend) }) };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('SettingsService', () => {
  test('returns renderer-safe defaults without credential fields', () => {
    const { settings } = createSettings();

    expect(settings.get()).toEqual({
      apiHost: null,
      authenticated: false,
      autoPaste: true,
      secureCredentials: true,
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
      transformsEnabled: true,
      autoAfterDictationTransform: { active: false, definitionId: 'polish' },
      shortcutBindings: defaultShortcutBindings('linux'),
      connectionMode: 'remote',
      inference: { speech: { provider: 'onnx', model: 'istupakov/parakeet-tdt-0.6b-v3-onnx' }, llm: { provider: 'off' } },
    });
    expect(JSON.stringify(settings.get())).not.toContain('Token');
  });

  test('persists credentials only through OS encryption and redacts them from get', () => {
    const { directory, settings } = createSettings();
    settings.setConnection('https://api.example.test', { accessToken: 'access-secret', refreshToken: 'refresh-secret' });

    expect(settings.get()).toMatchObject({ apiHost: 'https://api.example.test', authenticated: true });
    expect(settings.get()).not.toHaveProperty('accessToken');
    expect(readFileSync(join(directory, 'settings.json'), 'utf8')).not.toContain('access-secret');
    expect(readFileSync(join(directory, 'settings.json'), 'utf8')).toContain('encryptedSession');
  });

  test('remembers the signed-in account across restarts so an offline launch keeps its data', () => {
    const { directory, settings } = createSettings();
    settings.setConnection('https://api.example.test', { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
    settings.rememberSessionUser('user-1');

    const restarted = new SettingsService({ directory, safeStorage: createSafeStorage() });
    expect(restarted.getSessionUserId()).toBe('user-1');
    restarted.setSession(null);
    expect(restarted.getSessionUserId()).toBeNull();
    expect(new SettingsService({ directory, safeStorage: createSafeStorage() }).getSessionUserId()).toBeNull();
  });

  test('forgets the remembered account when a different server is connected', () => {
    const { settings } = createSettings();
    settings.setConnection('https://api.example.test', { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
    settings.rememberSessionUser('user-1');
    settings.setConnection('https://other.example.test', { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
    expect(settings.getSessionUserId()).toBeNull();
  });

  test('keeps the background update check off until the user turns it on', () => {
    const { directory, settings } = createSettings();
    expect(settings.get().checkUpdatesAutomatically).toBe(false);
    settings.update({ checkUpdatesAutomatically: true });
    expect(new SettingsService({ directory, safeStorage: createSafeStorage() }).get().checkUpdatesAutomatically).toBe(true);
  });

  test('recovers settings from the last good copy when settings.json is damaged', () => {
    const { directory, settings } = createSettings();
    settings.update({ language: 'fr' });
    settings.update({ autoPaste: false });
    writeFileSync(join(directory, 'settings.json'), Buffer.alloc(302, 0));

    const restarted = new SettingsService({ directory, safeStorage: createSafeStorage() });
    expect(restarted.get().language).toBe('fr');
    expect(restarted.get().autoPaste).toBe(false);
  });

  test('a backup never brings back a session the user signed out of', () => {
    const { directory, settings } = createSettings();
    settings.setConnection('https://api.example.test', { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
    settings.setSession(null);
    writeFileSync(join(directory, 'settings.json'), Buffer.alloc(64, 0));
    expect(new SettingsService({ directory, safeStorage: createSafeStorage() }).get().authenticated).toBe(false);
  });

  test('opens settings written by 0.2.0-beta.1 with every value kept', () => {
    const { directory, settings } = createSettings();
    settings.update({ language: 'de', autoPaste: false, launchAtLogin: true });
    settings.setConnectionMode('device');
    // Strip the fields added after beta.1, as a beta.1 install would have written the file.
    const file = join(directory, 'settings.json');
    const beta1 = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    delete beta1.sessionUserId;
    delete beta1.checkUpdatesAutomatically;
    writeFileSync(file, JSON.stringify(beta1));
    rmSync(`${file}.bak`, { force: true });

    const upgraded = new SettingsService({ directory, safeStorage: createSafeStorage() }).get();
    expect(upgraded).toMatchObject({ language: 'de', autoPaste: false, launchAtLogin: true, connectionMode: 'device', checkUpdatesAutomatically: false });
    expect(upgraded.shortcutBindings).toEqual(settings.get().shortcutBindings);
  });

  test('refuses to persist credentials using basic_text storage', () => {
    const { directory, settings } = createSettings('basic_text');
    settings.setConnection('https://api.example.test', { accessToken: 'access-secret', refreshToken: 'refresh-secret' });

    expect(settings.get()).toMatchObject({ authenticated: true, secureCredentials: false });
    expect(readFileSync(join(directory, 'settings.json'), 'utf8')).not.toContain('secret');
    expect(new SettingsService({ directory, safeStorage: createSafeStorage('basic_text') }).get().authenticated).toBe(false);
  });

  test('recovers from corrupt saved JSON without leaking its content to logs', () => {
    const { directory } = createSettings();
    const logger = { warn: vi.fn() };
    writeFileSync(join(directory, 'settings.json'), '{"accessToken":"secret",', 'utf8');

    const settings = new SettingsService({ directory, safeStorage: createSafeStorage(), logger });

    expect(settings.get().authenticated).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Settings file was unreadable; starting with defaults');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret');
  });

  test('uses platform shortcut defaults after invalid saved preferences', () => {
    const cases = [
      { platform: 'win32' as const, holdToTalk: 'Control+Super', toggleRecording: 'Control+Super+Space' },
      { platform: 'darwin' as const, holdToTalk: 'Control+Alt', toggleRecording: 'Control+Alt+Space' },
      { platform: 'linux' as const, holdToTalk: 'Control+Alt', toggleRecording: 'Control+Alt+Space' },
    ];

    for (const { platform, holdToTalk, toggleRecording } of cases) {
      const directory = mkdtempSync(join(tmpdir(), 'whisperer-settings-'));
      directories.push(directory);
      writeFileSync(join(directory, 'settings.json'), JSON.stringify({ autoPaste: 'invalid' }), 'utf8');

      const shortcutBindings = new SettingsService({ directory, platform, safeStorage: createSafeStorage() }).get().shortcutBindings;

      expect(shortcutBindings.holdToTalk).toEqual([holdToTalk]);
      expect(shortcutBindings.toggleRecording).toEqual([toggleRecording]);
    }
  });

  test('migrates legacy connection.json preferences and encrypted credentials', () => {
    const { directory } = createSettings();
    writeFileSync(join(directory, 'connection.json'), JSON.stringify({
      apiHost: 'https://api.example.test/v1/',
      encryptedSession: Buffer.from(JSON.stringify({ accessToken: 'old-access', refreshToken: 'old-refresh' })).toString('base64'),
      language: 'en',
      polish: true,
    }), 'utf8');

    const settings = new SettingsService({ directory, safeStorage: createSafeStorage() });

    expect(settings.get()).toMatchObject({ apiHost: 'https://api.example.test', authenticated: true, language: 'en', polish: true });
    expect(settings.getSession()).toEqual({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    expect(readFileSync(join(directory, 'settings.json'), 'utf8')).toContain('encryptedSession');
  });

  test('loads settings files that predate transforms with safe defaults', () => {
    const { directory } = createSettings();
    writeFileSync(join(directory, 'settings.json'), JSON.stringify({ language: 'en', shortcutBindings: defaultShortcutBindings('linux') }), 'utf8');

    const settings = new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage() });

    expect(settings.get()).toMatchObject({ transformsEnabled: true, autoAfterDictationTransform: { active: false, definitionId: 'polish' } });
    expect(settings.listTransforms().map((definition) => definition.id)).toEqual(['polish', 'prompt-engineer', 'decompose']);
  });

  test('fails closed rather than persisting unsupported automatic transforms', () => {
    const { settings } = createSettings();
    expect(() => settings.update({ autoAfterDictationTransform: { active: true, definitionId: 'polish' } })).toThrow('not available');
    expect(settings.get().autoAfterDictationTransform.active).toBe(false);
  });

  test('stores device-local onboarding rather than treating it as server state', () => {
    const { settings } = createSettings();

    expect(settings.update({ onboardingCompleted: true })).toMatchObject({ onboardingCompleted: true });
    expect(settings.get().onboardingCompleted).toBe(true);
  });

  test('migrates an old hold shortcut to push to talk and keeps a separate hands-free binding', () => {
    const { directory } = createSettings();
    writeFileSync(join(directory, 'settings.json'), JSON.stringify({ shortcut: 'Alt+Shift+Z', holdToTalk: true, scratchpadShortcut: '' }), 'utf8');

    const bindings = new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage() }).get().shortcutBindings;

    expect(bindings.holdToTalk).toEqual(['Alt+Shift+Z']);
    expect(bindings.toggleRecording).toEqual(['Control+Alt+Space']);
    expect(bindings.pasteLastTranscript).toEqual([]);
    expect(bindings.scratchpad).toEqual([]);
  });

  test('aliases the primary Polish definition with the generic Transform binding in both directions', () => {
    const { settings } = createSettings();

    expect(settings.get().shortcutBindings.transform).toEqual(['Alt+1']);
    expect(settings.listTransforms().find((definition) => definition.id === 'polish')?.shortcut).toBe('Alt+1');
    settings.update({ shortcutBindings: { ...settings.get().shortcutBindings, transform: ['Alt+Q'] } });
    expect(settings.listTransforms().find((definition) => definition.id === 'polish')?.shortcut).toBe('Alt+Q');
    settings.saveTransform({ id: 'polish', name: 'Polish', prompt: 'Keep meaning.', shortcut: 'Alt+W' });
    expect(settings.get().shortcutBindings.transform).toEqual(['Alt+W']);
  });

  test('rejects colliding bindings and leaves the saved file unchanged', () => {
    const { settings } = createSettings();
    const shortcutBindings = { ...defaultShortcutBindings('linux'), copyLastTranscript: ['Control+Alt'] };

    expect(() => settings.update({ shortcutBindings })).toThrow('This shortcut is already in use');
    expect(settings.get().shortcutBindings.copyLastTranscript).toEqual(['Alt+Shift+X']);
  });

  test('maps legacy shortcut updates onto the selected recording action', () => {
    const { settings } = createSettings();

    const result = settings.update({ shortcut: 'Alt+Q', holdToTalk: false });

    expect(result.shortcutBindings.toggleRecording).toEqual(['Alt+Q']);
    expect(result.shortcutBindings.holdToTalk).toEqual(['Control+Alt']);
  });
});

test('resetting transforms keeps another action shortcut and a valid signed-in session', () => {
  const { directory, settings } = createSettings();
  settings.setConnection('https://api.example.test', { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
  const decompose = settings.listTransforms().find((definition) => definition.id === 'decompose')!;
  settings.saveTransform({ ...decompose, shortcut: 'Alt+6' });
  settings.update({ shortcutBindings: { ...settings.get().shortcutBindings, scratchpad: ['Alt+2'] } });

  settings.resetTransforms();

  expect(settings.listTransforms().find((definition) => definition.id === 'decompose')?.shortcut).toBe('');
  const reloaded = new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage() });
  expect(reloaded.get()).toMatchObject({ authenticated: true, apiHost: 'https://api.example.test' });
  expect(reloaded.get().shortcutBindings.scratchpad).toEqual(['Alt+2']);
});

test('legacy bindings that overlap new transform defaults do not erase saved credentials', () => {
  const { directory, settings } = createSettings();
  settings.setConnection('https://api.example.test', { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
  const saved = JSON.parse(readFileSync(join(directory, 'settings.json'), 'utf8'));
  delete saved.transforms;
  saved.shortcutBindings.holdToTalk = ['Alt+2'];
  writeFileSync(join(directory, 'settings.json'), JSON.stringify(saved), 'utf8');

  const reloaded = new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage() });

  expect(reloaded.get()).toMatchObject({ authenticated: true, apiHost: 'https://api.example.test' });
  expect(reloaded.get().shortcutBindings.holdToTalk).toEqual(['Alt+2']);
  expect(reloaded.listTransforms().find((definition) => definition.id === 'decompose')?.shortcut).toBe('');
});

describe('on-device settings', () => {
  test('persists the selected connection mode across restarts independently of a retained remote session', () => {
    const { directory, settings } = createSettings();
    settings.setConnection('https://api.example.test', { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
    settings.setConnectionMode('device');

    const reloaded = new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage() });

    expect(reloaded.get()).toMatchObject({ connectionMode: 'device', authenticated: true, apiHost: 'https://api.example.test' });
    reloaded.setConnectionMode('remote');
    expect(new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage() }).get().connectionMode).toBe('remote');
  });

  test('stores inference keys only OS-encrypted and never returns them publicly', () => {
    const { directory, settings } = createSettings();
    settings.updateInference({
      speech: { provider: 'http', baseUrl: 'https://speech.example.test/v1', model: 'whisper-1', apiKey: 'speech-key-value' },
      llm: { provider: 'http', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2', apiKey: 'llm-key-value' },
    });

    const file = readFileSync(join(directory, 'settings.json'), 'utf8');
    expect(file).not.toContain('speech-key-value');
    expect(file).not.toContain('llm-key-value');
    expect(file).toContain('encryptedInferenceKeys');
    expect(JSON.stringify(settings.get())).not.toContain('key-value');
    expect(settings.get().inference).toEqual({
      speech: { provider: 'http', baseUrl: 'https://speech.example.test/v1', model: 'whisper-1', hasApiKey: true },
      llm: { provider: 'http', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2', hasApiKey: true },
    });
    const reloaded = new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage() });
    expect(reloaded.inferenceSecrets()).toEqual({ speechApiKey: 'speech-key-value', llmApiKey: 'llm-key-value' });
  });

  test('keeps a saved key when omitted, removes it when empty and drops it when the provider changes', () => {
    const { settings } = createSettings();
    settings.updateInference({ speech: { provider: 'http', baseUrl: 'https://speech.example.test/v1', model: 'whisper-1', apiKey: 'speech-key-value' } });
    settings.updateInference({ speech: { provider: 'http', baseUrl: 'https://speech.example.test/v2', model: 'whisper-1' } });
    expect(settings.inferenceSecrets().speechApiKey).toBe('speech-key-value');
    settings.updateInference({ speech: { provider: 'http', baseUrl: 'https://speech.example.test/v2', model: 'whisper-1', apiKey: '' } });
    expect(settings.inferenceSecrets().speechApiKey).toBe('');
    settings.updateInference({ speech: { provider: 'http', baseUrl: 'https://speech.example.test/v2', model: 'whisper-1', apiKey: 'again' } });
    settings.updateInference({ speech: { provider: 'onnx', model: 'istupakov/whisper-base-onnx' } });
    expect(settings.inferenceSecrets().speechApiKey).toBe('');
    expect(settings.get().inference?.speech).toEqual({ provider: 'onnx', model: 'istupakov/whisper-base-onnx' });
  });

  test('holds inference keys only in memory when OS encryption is unavailable', () => {
    const { directory, settings } = createSettings('basic_text');
    settings.updateInference({ llm: { provider: 'http', baseUrl: 'https://llm.example.test/v1', model: 'gpt', apiKey: 'llm-key-value' } });
    expect(readFileSync(join(directory, 'settings.json'), 'utf8')).not.toContain('llm-key-value');
    expect(settings.inferenceSecrets().llmApiKey).toBe('llm-key-value');
    expect(new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage('basic_text') }).inferenceSecrets().llmApiKey).toBe('');
  });

  test('an invalid saved mode or inference block falls back to defaults without signing out', () => {
    const { directory, settings } = createSettings();
    settings.setConnection('https://api.example.test', { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
    const saved = JSON.parse(readFileSync(join(directory, 'settings.json'), 'utf8'));
    saved.connectionMode = 'satellite';
    saved.inference = { speech: { provider: 'shell', command: 'rm -rf /' } };
    writeFileSync(join(directory, 'settings.json'), JSON.stringify(saved), 'utf8');

    const reloaded = new SettingsService({ directory, platform: 'linux', safeStorage: createSafeStorage() });

    expect(reloaded.get()).toMatchObject({ authenticated: true, connectionMode: 'remote', inference: { speech: { provider: 'onnx' }, llm: { provider: 'off' } } });
  });

  test('drops a saved key when its endpoint host changes', () => {
    const { settings } = createSettings();
    settings.updateInference({ llm: { provider: 'http', baseUrl: 'https://llm.example.test/v1', model: 'gpt', apiKey: 'llm-key-value' } });
    settings.updateInference({ llm: { provider: 'http', baseUrl: 'https://llm.example.test/v2', model: 'gpt' } });
    expect(settings.inferenceSecrets().llmApiKey).toBe('llm-key-value');
    settings.updateInference({ llm: { provider: 'http', baseUrl: 'https://other.example.test/v2', model: 'gpt' } });
    expect(settings.inferenceSecrets().llmApiKey).toBe('');
    expect(settings.get().inference?.llm).toMatchObject({ hasApiKey: false });
  });
});
