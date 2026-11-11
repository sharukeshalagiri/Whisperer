import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { LocalServerStatus } from '../../shared/contracts';
import { ConnectionModeCoordinator } from './ConnectionModeCoordinator';
import { LocalServerService, type LocalChild, type LocalServerOptions } from './LocalServerService';

const directories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

/** A controllable stand-in for the Python child process. */
class FakeChild extends EventEmitter implements LocalChild {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly signals: string[] = [];
  stdinText = '';
  stdinEnded = false;
  exitCode: number | null = null;

  constructor() {
    super();
    this.stdin.on('data', (chunk: Buffer) => { this.stdinText += chunk.toString('utf8'); });
    this.stdin.on('finish', () => { this.stdinEnded = true; });
  }

  /** Records a signal and exits like a cooperative server. */
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal);
    this.exit(null, signal);
    return true;
  }

  /** Emits one JSON event line on stdout. */
  event(value: unknown): void { this.stdout.write(`${JSON.stringify(value)}\n`); }

  /** Simulates process exit once. */
  exit(code: number | null, signal: string | null = null): void {
    if (this.exitCode !== null) return;
    this.exitCode = code ?? -1;
    this.emit('exit', code, signal);
  }

  /** Parses the private boot document written to stdin. */
  boot(): { bootToken: string; speechApiKey: string; llmApiKey: string } {
    return JSON.parse(this.stdinText.split('\n')[0]!) as { bootToken: string; speechApiKey: string; llmApiKey: string };
  }
}

interface Harness {
  service: LocalServerService;
  children: FakeChild[];
  spawns: Array<{ file: string; args: string[]; cwd: string; env: Record<string, string> }>;
  requests: Array<{ url: string; authorization: string | null; body: string | null }>;
  statuses: LocalServerStatus[];
  directory: string;
}

/** Builds a service with a fake runtime, child and loopback server. */
function harness(overrides: Partial<LocalServerOptions> & { health?: (instanceId: string) => unknown; hmac?: (token: string, nonce: string) => string; installed?: boolean; install?: (signal: AbortSignal) => Promise<unknown> } = {}): Harness {
  const directory = mkdtempSync(join(tmpdir(), 'whisperer-local-server-'));
  directories.push(directory);
  const children: FakeChild[] = [];
  const spawns: Harness['spawns'] = [];
  const requests: Harness['requests'] = [];
  const statuses: LocalServerStatus[] = [];
  let configInstance = '';
  const location = { python: '/runtime/envs/key/bin/python', cwd: '/resources/api/apps/api/src', key: 'key' };
  const service = new LocalServerService({
    installer: {
      installed: async () => overrides.installed === false ? null : location,
      install: async (signal) => { if (overrides.install) await overrides.install(signal); return location; },
    },
    spawn: (file, args, options) => {
      spawns.push({ file, args: [...args], cwd: options.cwd, env: { ...options.env } });
      configInstance = (JSON.parse(readFileSync(args[args.indexOf('--config') + 1]!, 'utf8')) as { instanceId: string }).instanceId;
      const child = new FakeChild();
      children.push(child);
      return child;
    },
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({ url, authorization: headers.get('authorization'), body: typeof init?.body === 'string' ? init.body : null });
      const path = new URL(url).pathname;
      if (path === '/v1/health') return Response.json(overrides.health ? overrides.health(configInstance) : { status: 'ok', service: 'whisperer', version: '0.1.0', instanceId: configInstance });
      if (path === '/v1/local/challenge') {
        const { nonce } = JSON.parse(String(init?.body)) as { nonce: string };
        const token = children.at(-1)!.boot().bootToken;
        return Response.json({ hmac: overrides.hmac ? overrides.hmac(token, nonce) : createHmac('sha256', token).update(nonce).digest('base64url') });
      }
      if (path === '/v1/inference/status') return Response.json({ speech: { provider: 'onnx', model: 'istupakov/parakeet-tdt-0.6b-v3-onnx', status: 'missing', message: 'Download the model to dictate.' }, llm: { provider: 'off', model: null, status: 'off', message: null } });
      return new Response(null, { status: 404 });
    },
    dataDirectory: join(directory, 'data'),
    inference: () => ({ speech: { provider: 'http', baseUrl: 'https://speech.example.test/v1', model: 'whisper-1', hasApiKey: true }, llm: { provider: 'off' } }),
    secrets: () => ({ speechApiKey: 'speech-secret-key', llmApiKey: '' }),
    environment: { HOME: '/home/user', PATH: '/usr/bin', AWS_SECRET_ACCESS_KEY: 'parent-secret', PYTHONPATH: '/evil' },
    onChange: (status) => statuses.push(status),
    startupTimeoutMs: 5_000,
    ...overrides,
  });
  return { service, children, spawns, requests, statuses, directory };
}

/** Drives the fake child through bind, database and ready. */
async function boot(h: Harness, child = h.children.at(-1)!): Promise<void> {
  child.event({ event: 'bind', port: 43123 });
  child.event({ event: 'database', status: 'ready' });
  child.event({ event: 'ready' });
}

/** Waits until the service reaches a state. */
async function until(h: Harness, state: LocalServerStatus['state']): Promise<void> {
  await vi.waitFor(() => expect(h.service.status().state).toBe(state), { timeout: 2000 });
}

describe('LocalServerService', () => {
  test('without an installed runtime reports notInstalled and never spawns or downloads', async () => {
    const h = harness({ installed: false });
    await h.service.start();
    expect(h.service.status()).toMatchObject({ state: 'notInstalled', canRetry: false });
    expect(h.spawns).toEqual([]);
  });

  test('reports whether the runtime is installed without starting or downloading anything', async () => {
    const missing = harness({ installed: false });
    expect(await missing.service.runtimeInstalled()).toBe(false);
    const present = harness();
    expect(await present.service.runtimeInstalled()).toBe(true);
    expect(missing.spawns).toEqual([]);
    expect(present.spawns).toEqual([]);
  });

  test('launches with an argument array, a secret-free 0600 config, an allowlisted environment and secrets only on open stdin', async () => {
    const h = harness();
    const started = h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    const [spawn] = h.spawns;
    expect(spawn!.file).toBe('/runtime/envs/key/bin/python');
    expect(spawn!.args.slice(0, 6)).toEqual(['-B', '-E', '-s', '-m', 'whisperer_api', 'serve-local']);
    expect(spawn!.cwd).toBe('/resources/api/apps/api/src');
    expect(spawn!.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(spawn!.env.PYTHONPATH).toBeUndefined();
    expect(spawn!.env.HOME).toBe('/home/user');
    const configPath = spawn!.args.at(-1)!;
    const configText = readFileSync(configPath, 'utf8');
    if (process.platform !== 'win32') expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(configText)).toMatchObject({ version: 1, dataDirectory: join(h.directory, 'data'), speech: { provider: 'http', baseUrl: 'https://speech.example.test/v1', model: 'whisper-1' }, llm: { provider: 'off' } });
    expect(configText).not.toContain('speech-secret-key');
    expect(JSON.stringify(spawn!.args)).not.toContain('speech-secret-key');
    const child = h.children[0]!;
    await vi.waitFor(() => expect(child.stdinText).toContain('\n'));
    expect(child.boot()).toMatchObject({ speechApiKey: 'speech-secret-key', llmApiKey: '' });
    expect(child.boot().bootToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(child.stdinEnded).toBe(false);

    await boot(h);
    await started;
    await until(h, 'ready');
    expect(h.service.status()).toMatchObject({ state: 'ready', port: 43123, message: 'Running on this device', speech: { status: 'missing' }, llm: { status: 'off' } });
    expect(h.service.connection()).toEqual({ host: 'http://127.0.0.1:43123', token: child.boot().bootToken, generation: expect.any(Number) });
    const health = h.requests.findIndex((request) => request.url.endsWith('/v1/health'));
    const challenge = h.requests.findIndex((request) => request.url.endsWith('/v1/local/challenge'));
    expect(health).toBeLessThan(challenge);
    for (const request of h.requests.slice(0, challenge + 1)) expect(request.authorization).toBeNull();
    expect(h.requests.find((request) => request.url.endsWith('/v1/inference/status'))?.authorization).toBe(`Bearer ${child.boot().bootToken}`);
  });

  test('never trusts a port whose health reports another instance and stops the owned child', async () => {
    const h = harness({ health: () => ({ status: 'ok', service: 'whisperer', version: '0.1.0', instanceId: 'someone-else' }) });
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    await boot(h);
    await until(h, 'failed');
    expect(h.service.status()).toMatchObject({ stage: 'verify', message: 'The local server did not prove its identity.', canRetry: true });
    expect(h.service.connection()).toBeNull();
    expect(h.requests.some((request) => request.authorization !== null)).toBe(false);
    expect(h.requests.some((request) => request.url.endsWith('/v1/local/challenge'))).toBe(false);
    expect(h.children[0]!.exitCode).not.toBeNull();
    expect(h.children).toHaveLength(1);
  });

  test('rejects a wrong challenge answer', async () => {
    const h = harness({ hmac: () => 'AAAA' });
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    await boot(h);
    await until(h, 'failed');
    expect(h.service.connection()).toBeNull();
    expect(h.requests.some((request) => request.authorization !== null)).toBe(false);
  });

  test('concurrent starts create one child', async () => {
    const h = harness();
    void h.service.start();
    void h.service.start();
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    await boot(h);
    await until(h, 'ready');
    expect(h.spawns).toHaveLength(1);
  });

  test('buffers partial lines, drops oversized events and redacts secrets from the activity log', async () => {
    const h = harness();
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    const child = h.children[0]!;
    await vi.waitFor(() => expect(child.stdinText).toContain('\n'));
    child.stdout.write('{"event":"bi');
    child.stdout.write('nd","port":43123}\n');
    child.stdout.write(`${'x'.repeat(5000)}\n`);
    child.stderr.write(`INFO token=${child.boot().bootToken} key speech-secret-key Authorization: Bearer abc.def\n`);
    child.event({ event: 'model', status: 'downloading', completedBytes: 10, totalBytes: 100, message: 'Downloading model…' });
    child.event({ event: 'database', status: 'ready' });
    child.event({ event: 'ready' });
    await until(h, 'ready');
    expect(h.service.status().port).toBe(43123);
    const log = h.service.status().log.join('\n');
    expect(log).toContain('Ignored an oversized server event');
    expect(log).not.toContain(child.boot().bootToken);
    expect(log).not.toContain('speech-secret-key');
    expect(log).not.toContain('abc.def');
    expect(h.service.status().log.every((line) => line.length <= 300)).toBe(true);
  });

  test('reports model progress from server events', async () => {
    const h = harness();
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    await boot(h);
    await until(h, 'ready');
    h.children[0]!.event({ event: 'model', status: 'downloading', completedBytes: 512, totalBytes: 2048, message: 'Downloading model…' });
    await vi.waitFor(() => expect(h.service.status().speech).toMatchObject({ status: 'downloading', progress: { completedBytes: 512, totalBytes: 2048 } }));
  });

  test('restarts a crashed server at most twice, then fails visibly', async () => {
    const h = harness();
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    await boot(h);
    await until(h, 'ready');
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      h.children.at(-1)!.exit(1);
      await vi.waitFor(() => expect(h.children).toHaveLength(attempt + 1));
      await boot(h);
      await until(h, 'ready');
    }
    h.children.at(-1)!.exit(1);
    await until(h, 'failed');
    expect(h.service.status()).toMatchObject({ message: 'Local server stopped unexpectedly', canRetry: true });
    expect(h.children).toHaveLength(3);
    expect(h.service.connection()).toBeNull();

    void h.service.restart();
    await vi.waitFor(() => expect(h.children).toHaveLength(4));
    await boot(h);
    await until(h, 'ready');
  });

  test('stop closes stdin, waits for exit and does not count as a crash', async () => {
    const h = harness();
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    await boot(h);
    await until(h, 'ready');
    const child = h.children[0]!;
    child.stdin.on('finish', () => child.exit(0));
    await h.service.stop();
    expect(child.stdinEnded).toBe(true);
    expect(h.service.status()).toMatchObject({ state: 'stopped', port: null });
    expect(h.service.connection()).toBeNull();
    expect(h.children).toHaveLength(1);
  });

  test('fails with a clear message when the server never becomes ready', async () => {
    const h = harness({ startupTimeoutMs: 50 });
    void h.service.start();
    await until(h, 'failed');
    expect(h.service.status().message).toMatch(/did not start in time/);
    expect(h.children[0]!.signals.length).toBeGreaterThan(0);
  });

  test('a server error event fails startup with its message', async () => {
    const h = harness();
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    h.children[0]!.event({ event: 'error', code: 'database', message: 'The database could not be opened.' });
    h.children[0]!.exit(1);
    await until(h, 'failed');
    expect(h.service.status().message).toContain('The database could not be opened.');
  });

  test('cancel stops a start in progress', async () => {
    const h = harness();
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    await h.service.cancel();
    expect(h.service.status().state).toBe('stopped');
    expect(h.children[0]!.exitCode).not.toBeNull();
  });

  test('cancelling an install aborts it and never starts a server', async () => {
    let aborted = false;
    const h = harness({ install: (signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); })) });
    const setup = h.service.setup();
    await until(h, 'installing');
    await h.service.cancel();
    await setup;
    expect(aborted).toBe(true);
    expect(h.spawns).toEqual([]);
    expect(h.service.status().message).toBe('Setup was cancelled.');
  });

  test('an install that completes after on-device mode was left does not start the server', async () => {
    let running = true;
    let finish: (() => void) | undefined;
    const h = harness({ shouldRun: () => running, install: () => new Promise<void>((resolve) => { finish = resolve; }) });
    const setup = h.service.setup();
    await until(h, 'installing');
    running = false;
    finish?.();
    await setup;
    expect(h.spawns).toEqual([]);
    expect(h.service.status().state).toBe('stopped');
  });

  test('a verification that finishes after stop never marks the server ready', async () => {
    let releaseHealth: (() => void) | undefined;
    const h = harness();
    const originalFetch = (h.service as unknown as { options: LocalServerOptions }).options.fetch;
    (h.service as unknown as { options: LocalServerOptions }).options.fetch = async (url, init) => {
      if (url.endsWith('/v1/health')) await new Promise<void>((resolve) => { releaseHealth = resolve; });
      return originalFetch(url, init);
    };
    void h.service.start();
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    await boot(h);
    await vi.waitFor(() => expect(releaseHealth).toBeDefined());
    const launch = (h.service as unknown as { launch: { stopping: boolean } }).launch;
    launch.stopping = true;
    releaseHealth?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.service.connection()).toBeNull();
    expect(h.service.status().state).not.toBe('ready');
  });

  test('switching to remote mid-install aborts the install and never starts a server in remote mode', async () => {
    let mode: 'remote' | 'device' = 'device';
    let aborted = false;
    const h = harness({
      shouldRun: () => mode === 'device',
      install: (signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); })),
    });
    const coordinator = new ConnectionModeCoordinator({
      mode: () => mode, persist: (next) => { mode = next; }, busy: () => null, detach: () => undefined, attach: () => undefined, log: () => undefined,
      startLocal: () => h.service.start(),
      stopLocal: () => h.service.cancel().then(() => h.service.stop()),
    });
    const setup = h.service.setup();
    await until(h, 'installing');

    await coordinator.switchTo('remote');
    await setup;

    expect(mode).toBe('remote');
    expect(aborted).toBe(true);
    expect(h.spawns).toEqual([]);
    expect(h.service.connection()).toBeNull();
    await h.service.start();
    expect(h.spawns).toEqual([]);
  });
});
