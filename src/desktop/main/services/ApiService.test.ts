import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ApiService } from './ApiService';
import { SettingsService, type SafeStorage } from './SettingsService';

const directories: string[] = [];

/** Creates a deterministic safe-storage provider for tests only. */
function safeStorage(): SafeStorage {
  return {
    decryptString: (value) => value.toString('utf8'),
    encryptString: (value) => Buffer.from(value, 'utf8'),
    getSelectedStorageBackend: () => 'keychain',
    isEncryptionAvailable: () => true,
  };
}

/** Creates an isolated settings service for network service tests. */
function settings(): SettingsService {
  const directory = mkdtempSync(join(tmpdir(), 'whisperer-api-service-'));
  directories.push(directory);
  return new SettingsService({ directory, safeStorage: safeStorage() });
}

/** Builds a JSON response with the status expected by the generated client. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('ApiService', () => {
  test('ignores whisperer:// links that do not match the sign-in in progress exactly', async () => {
    const serviceSettings = settings();
    const opened: string[] = [];
    let polls = 0;
    let complete = false;
    const service = new ApiService({
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname === '/v1/health') return json({ service: 'whisperer' });
        if (url.pathname === '/device/poll') {
          polls += 1;
          return json(complete ? { accessToken: 'access', onboardingCompleted: true, refreshToken: 'refresh', status: 'complete' } : { status: 'pending' });
        }
        throw new Error(`Unexpected ${url.pathname}`);
      },
      onSignOut: () => undefined,
      openExternal: async (url) => { opened.push(url); },
      settings: serviceSettings,
    });

    expect(await service.handleDeepLink('whisperer://auth/transfer/success?device_code=anything')).toBeNull();
    const signIn = service.signIn('https://api.example.test');
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const code = new URL(opened[0]!).searchParams.get('device_code')!;
    const pollsBefore = polls;
    for (const link of [
      `whisperer://auth/transfer/success?device_code=${code}&access_token=stolen`,
      `whisperer://auth/transfer/success?device_code=${code}&refresh_token=stolen`,
      'whisperer://auth/transfer/success?device_code=00000000-0000-4000-8000-000000000000',
      `whisperer://evil/transfer/success?device_code=${code}`,
      `whisperer://auth/other?device_code=${code}`,
      `https://auth/transfer/success?device_code=${code}`,
      'not a url',
      `javascript:alert(1)//?device_code=${code}`,
    ]) {
      expect(await service.handleDeepLink(link)).toBeNull();
    }
    expect(polls).toBe(pollsBefore);
    expect(serviceSettings.get().authenticated).toBe(false);
    complete = true;
    await expect(signIn).resolves.toMatchObject({ status: 'complete' });
  });

  test('lists every meeting page, not only the first', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'access', refreshToken: 'refresh' });
    const meeting = (id: string) => ({
      id, title: id, startedAt: '2026-10-13T00:00:00Z', endedAt: null, durationMs: 0, revision: 1, transcript: '', transcriptRevision: 0,
      summary: '', summaryRevision: 0, summarySourceRevision: null, summaryStale: false, transcriptStatus: 'complete', summaryStatus: 'idle', error: null, hasAudio: false,
    });
    const cursors: Array<string | null> = [];
    const service = new ApiService({
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname !== '/v1/meetings') throw new Error(`Unexpected ${url.pathname}`);
        const cursor = url.searchParams.get('cursor');
        cursors.push(cursor);
        return cursor === null ? json({ items: [meeting('a')], nextCursor: 'page-2' }) : json({ items: [meeting('b')], nextCursor: null });
      },
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await expect(service.listMeetings()).resolves.toMatchObject([{ id: 'a' }, { id: 'b' }]);
    expect(cursors).toEqual([null, 'page-2']);
  });

  test('awaits verifier-protected polling and persists only a completed device login', async () => {
    const serviceSettings = settings();
    const opened: string[] = [];
    const service = new ApiService({
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname === '/v1/health') return json({ service: 'whisperer' });
        if (url.pathname === '/device/poll') return json({
          accessToken: 'access',
          onboardingCompleted: true,
          refreshToken: 'refresh',
          status: 'complete',
        });
        throw new Error(`Unexpected ${url.pathname}`);
      },
      onSignOut: () => undefined,
      openExternal: async (url) => { opened.push(url); },
      settings: serviceSettings,
    });

    await expect(service.signIn('https://api.example.test')).resolves.toMatchObject({ onboardingCompleted: true, status: 'complete' });
    expect(new URL(opened[0]!).pathname).toBe('/login');
    expect(serviceSettings.get()).toMatchObject({ apiHost: 'https://api.example.test', authenticated: true });
  });

  test('keeps polling while the browser has not yet opened the login transaction', async () => {
    const serviceSettings = settings();
    const polls: number[] = [];
    const service = new ApiService({
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname === '/v1/health') return json({ service: 'whisperer' });
        if (url.pathname === '/device/poll') {
          polls.push(polls.length);
          if (polls.length === 1) return json({ detail: 'Device authorization is invalid or expired.' }, 401);
          return json({ accessToken: 'access', refreshToken: 'refresh', status: 'complete' });
        }
        throw new Error(`Unexpected ${url.pathname}`);
      },
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await expect(service.signIn('https://api.example.test')).resolves.toMatchObject({ status: 'complete' });
    expect(polls).toHaveLength(2);
    expect(serviceSettings.get().authenticated).toBe(true);
  }, 10000);

  test('reports an expired device login once the server has acknowledged it', async () => {
    const serviceSettings = settings();
    let polls = 0;
    const service = new ApiService({
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname === '/v1/health') return json({ service: 'whisperer' });
        if (url.pathname === '/device/poll') {
          polls += 1;
          return polls === 1 ? json({ status: 'pending' }) : json({ detail: 'Device authorization is invalid or expired.' }, 401);
        }
        throw new Error(`Unexpected ${url.pathname}`);
      },
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await expect(service.signIn('https://api.example.test')).rejects.toThrow('Device authorization is invalid or expired.');
    expect(serviceSettings.get().authenticated).toBe(false);
  }, 10000);

  test('does not persist a device completion after login cancellation', async () => {
    const serviceSettings = settings();
    let resolvePoll: ((response: Response) => void) | undefined;
    const service = new ApiService({
      fetch: (input) => {
        const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
        if (path === '/v1/health') return Promise.resolve(json({ service: 'whisperer' }));
        if (path === '/device/poll') return new Promise((resolve) => { resolvePoll = resolve; });
        throw new Error(`Unexpected ${path}`);
      },
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    const pending = service.signIn('https://api.example.test');
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.cancelLogin();
    resolvePoll?.(json({ accessToken: 'access', refreshToken: 'refresh', status: 'complete' }));

    await expect(pending).resolves.toBeNull();
    expect(serviceSettings.get().authenticated).toBe(false);
  });

  test('uses a single refresh for concurrent expired requests', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'expired', refreshToken: 'refresh' });
    let refreshCalls = 0;
    const service = new ApiService({
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        const path = new URL(request.url).pathname;
        const authorization = request.headers.get('authorization');
        if (path === '/v1/auth/refresh') {
          refreshCalls += 1;
          return json({ accessToken: 'fresh', refreshToken: 'rotated' });
        }
        if (path === '/v1/me' && authorization === 'Bearer expired') return json({ detail: 'expired' }, 401);
        if (path === '/v1/me' && authorization === 'Bearer fresh') return json({ user: { id: 'user-1' } });
        throw new Error(`Unexpected ${path} ${authorization}`);
      },
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await expect(Promise.all([service.me(), service.me()])).resolves.toEqual([{ id: 'user-1' }, { id: 'user-1' }]);
    expect(refreshCalls).toBe(1);
    expect(serviceSettings.getSession()).toEqual({ accessToken: 'fresh', refreshToken: 'rotated' });
  });

  test('keeps a valid local session after a transient refresh timeout', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'expired', refreshToken: 'refresh' });
    const service = new ApiService({
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        const path = new URL(request.url).pathname;
        if (path === '/v1/me') return json({ detail: 'expired' }, 401);
        if (path === '/v1/auth/refresh') throw new DOMException('Timed out', 'AbortError');
        throw new Error(`Unexpected ${path}`);
      },
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await expect(service.me()).rejects.toThrow('Timed out');
    expect(serviceSettings.get().authenticated).toBe(true);
  });

  test('cleans up local credentials when server logout is offline', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'access', refreshToken: 'refresh' });
    let signOuts = 0;
    const service = new ApiService({
      fetch: async () => { throw new Error('offline'); },
      onSignOut: () => { signOuts += 1; },
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await expect(service.signOut()).rejects.toThrow('offline');
    expect(serviceSettings.get()).toMatchObject({ apiHost: null, authenticated: false });
    expect(signOuts).toBe(1);
  });

  test('passes the transcription cancellation signal into generated HTTP requests', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'access', refreshToken: 'refresh' });
    let receivedSignal: AbortSignal | undefined;
    let resolveUpload: (() => void) | undefined;
    const service = new ApiService({
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        receivedSignal = request.signal;
        await new Promise<void>((resolve) => { resolveUpload = resolve; });
        return json({ id: 'transcript-1' });
      },
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });
    const controller = new AbortController();

    const pending = service.transcribe({ audio: new Uint8Array([1, 2, 3]), contentType: 'audio/wav', filename: 'clip.wav' }, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    expect(receivedSignal?.aborted).toBe(true);
    resolveUpload?.();

    await expect(pending).resolves.toEqual({ id: 'transcript-1' });
  });

  test('device mode routes to the verified local server with its boot token and never refreshes or touches the remote session', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'remote-access', refreshToken: 'remote-refresh' });
    serviceSettings.setConnectionMode('device');
    const seen: Array<{ url: string; authorization: string | null }> = [];
    const service = new ApiService({
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        seen.push({ url: request.url, authorization: request.headers.get('authorization') });
        if (new URL(request.url).pathname === '/v1/dictionary') return json({ items: [] });
        return json({ detail: 'Unauthorized' }, 401);
      },
      local: () => ({ host: 'http://127.0.0.1:43123', token: 'boot-token', generation: 1 }),
      onSignOut: () => { throw new Error('remote session must not be cleared'); },
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await expect(service.listDictionary()).resolves.toEqual([]);
    await expect(service.listNotes()).rejects.toMatchObject({ status: 401 });
    expect(seen.map((request) => new URL(request.url).origin)).toEqual(['http://127.0.0.1:43123', 'http://127.0.0.1:43123']);
    expect(seen.every((request) => request.authorization === 'Bearer boot-token')).toBe(true);
    expect(seen.some((request) => request.url.includes('/v1/auth/refresh'))).toBe(false);
    expect(serviceSettings.getSession()).toEqual({ accessToken: 'remote-access', refreshToken: 'remote-refresh' });
  });

  test('device mode fails fast with a typed error while the local server is not ready', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnectionMode('device');
    let calls = 0;
    const service = new ApiService({
      fetch: async () => { calls += 1; return json({}); },
      local: () => null,
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await expect(service.listDictionary()).rejects.toMatchObject({ code: 'LOCAL_SERVER_UNAVAILABLE', message: "The on-device server isn't running." });
    expect(calls).toBe(0);
  });

  test('remote mode never uses a local connection even if one exists', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'remote-access', refreshToken: 'remote-refresh' });
    const origins: string[] = [];
    const service = new ApiService({
      fetch: async (input) => { origins.push(new URL(input instanceof Request ? input.url : input).origin); return json({ items: [] }); },
      local: () => ({ host: 'http://127.0.0.1:43123', token: 'boot-token', generation: 1 }),
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    await service.listDictionary();
    expect(origins).toEqual(['https://api.example.test']);
  });

  test('discards a meeting question that arrives after a backend switch', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'remote-access', refreshToken: 'remote-refresh' });
    let release: (() => void) | undefined;
    const service = new ApiService({
      fetch: async () => { await new Promise<void>((resolve) => { release = resolve; }); return json({ answer: 'late answer', transcriptRevision: 1, summaryRevision: 1, summaryStale: false, usedSummary: true }); },
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    const pending = service.askMeetingQuestion({ id: 'meeting', question: 'What changed?' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    serviceSettings.setConnectionMode('device');
    service.invalidate();
    release?.();

    await expect(pending).rejects.toThrow('The connection changed.');
  });

  test('a response that arrives after a backend switch is discarded', async () => {
    const serviceSettings = settings();
    serviceSettings.setConnection('https://api.example.test', { accessToken: 'remote-access', refreshToken: 'remote-refresh' });
    let release: (() => void) | undefined;
    const service = new ApiService({
      fetch: async () => { await new Promise<void>((resolve) => { release = resolve; }); return json({ items: [{ id: 'remote-entry', phrase: 'a', replacement: 'b' }] }); },
      local: () => ({ host: 'http://127.0.0.1:43123', token: 'boot-token', generation: 1 }),
      onSignOut: () => undefined,
      openExternal: async () => undefined,
      settings: serviceSettings,
    });

    const pending = service.listDictionary();
    await new Promise((resolve) => setTimeout(resolve, 0));
    serviceSettings.setConnectionMode('device');
    service.invalidate();
    release?.();

    await expect(pending).rejects.toThrow('The connection changed.');
  });
});
