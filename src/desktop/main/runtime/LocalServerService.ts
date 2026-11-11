import { spawn as spawnProcess } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

import type { ByteProgress, InferenceSettings, LlmStatus, LocalServerStatus, SpeechStatus } from '../../shared/contracts';
import { idleLocalServerStatus } from '../../shared/protocol';
import { redact } from '../services/Logger';
import type { InstallProgress, RuntimeInstaller, RuntimeLocation } from './RuntimeInstaller';

/** The parts of a child process the supervisor uses. */
export interface LocalChild {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'exit', listener: (code: number | null, signal: string | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
}

/** Spawns one program with an argument array and no shell. */
export type SpawnChild = (file: string, args: readonly string[], options: { cwd: string; env: Record<string, string> }) => LocalChild;

/** Configures the supervisor of the owned on-device API server. */
export interface LocalServerOptions {
  installer: Pick<RuntimeInstaller, 'installed' | 'install'> & { invalidate?: () => void };
  spawn: SpawnChild;
  /** Loopback fetch; never used for anything except the owned child. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Private directory for the local SQLite database, audio and models. */
  dataDirectory: string;
  inference: () => InferenceSettings;
  /** Decrypted provider keys, read only at launch and sent only over stdin. */
  secrets: () => { speechApiKey: string; llmApiKey: string };
  environment: Record<string, string | undefined>;
  onChange: (status: LocalServerStatus) => void;
  startupTimeoutMs?: number;
  maxRestarts?: number;
  /** How often a ready server is checked; 3 missed checks in a row count as a hang. */
  healthIntervalMs?: number;
  /** First automatic restart delay; it doubles with each restart in the budget. */
  restartDelayMs?: number;
  /** Whether on-device mode is still selected; a late install or restart never starts a server otherwise. */
  shouldRun?: () => boolean;
}

/** A verified connection to the owned server. Main-process only. */
export interface LocalConnection {
  host: string;
  token: string;
  /** Changes on every launch so callers can drop work bound to an older child. */
  generation: number;
}

/** A child launch and everything bound to it. */
interface Launch {
  child: LocalChild;
  generation: number;
  instanceId: string;
  token: string;
  secrets: string[];
  port: number | null;
  stopping: boolean;
  exited: Promise<void>;
  error: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  settle: (ok: boolean) => void;
  health?: ReturnType<typeof setInterval>;
}

/** After this long without trouble, the automatic restart budget is full again. */
const HEALTHY_RESET_MS = 10 * 60_000;
const MAX_EVENT_BYTES = 4096;
const MAX_LOG_LINES = 100;
const ALLOWED_ENVIRONMENT = [
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'windir', 'PATH', 'Path',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR',
];
const SPEECH_STATUSES = new Set<SpeechStatus>(['unknown', 'unconfigured', 'missing', 'downloading', 'verifying', 'loading', 'ready', 'failed']);
const LLM_STATUSES = new Set<LlmStatus>(['unknown', 'unconfigured', 'off', 'ready', 'failed']);

/** Installs on demand, launches, verifies and supervises the one owned on-device API server. */
export class LocalServerService {
  private current: LocalServerStatus = idleLocalServerStatus();
  private launch: Launch | null = null;
  private verified: LocalConnection | null = null;
  private generation = 0;
  private restarts = 0;
  private startupFailures = 0;
  private startFlight: Promise<void> | null = null;
  private installController: AbortController | null = null;

  /** Args: options supplies every side effect, so the service runs without Electron. */
  constructor(private readonly options: LocalServerOptions) {}

  /** Returns a detached renderer-safe status snapshot. */
  status(): LocalServerStatus { return structuredClone(this.current); }

  /** Returns the verified connection, or null when the server is not ready. */
  connection(): LocalConnection | null { return this.verified ? { ...this.verified } : null; }

  /** Whether a complete runtime for this build exists on disk. Reads only; never downloads or starts. */
  async runtimeInstalled(): Promise<boolean> { return (await this.options.installer.installed()) !== null; }

  /** Starts an installed runtime. Without one, reports notInstalled and downloads nothing. */
  start(): Promise<void> {
    this.startFlight ??= this.performStart().finally(() => { this.startFlight = null; });
    return this.startFlight;
  }

  /** User-initiated: installs any missing runtime piece with progress, then starts the server. */
  async setup(): Promise<void> {
    if (this.launch || this.current.state === 'installing') return this.startFlight ?? undefined;
    const controller = new AbortController();
    this.installController = controller;
    this.restarts = 0;
    this.update({ state: 'installing', stage: 'uv', message: 'Preparing on-device mode…', progress: null, canRetry: false });
    try {
      await this.options.installer.install(controller.signal, (event) => this.installProgress(event));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Setup failed.';
      const stage = error && typeof error === 'object' && 'stage' in error ? (error as { stage: InstallProgress['stage'] | null }).stage : null;
      this.appendLog(message);
      const runtime = await this.options.installer.installed();
      if (controller.signal.aborted) this.update({ state: runtime ? 'stopped' : 'notInstalled', stage: null, message: 'Setup was cancelled.', progress: null, canRetry: true });
      else this.update({ state: 'failed', stage, message, progress: null, canRetry: true });
      return;
    } finally {
      if (this.installController === controller) this.installController = null;
    }
    if (this.options.shouldRun && !this.options.shouldRun()) {
      this.update({ state: 'stopped', stage: null, message: null, progress: null, canRetry: true });
      return;
    }
    await this.start();
  }

  /** Stops and starts again, resetting the automatic restart budget. */
  async restart(): Promise<void> {
    await this.stop();
    this.restarts = 0;
    await this.start();
  }

  /** Cancels an install or a start in progress. A ready server keeps running. */
  async cancel(): Promise<void> {
    this.installController?.abort();
    if (this.launch && this.current.state === 'starting') await this.stop(false);
  }

  /** Stops the owned child. Graceful closes stdin first (the server exits on EOF); either way it escalates to signals. */
  async stop(graceful = true): Promise<void> {
    const launch = this.launch;
    if (!launch) {
      if (this.current.state !== 'notInstalled' && this.current.state !== 'failed' && this.current.state !== 'installing') this.update({ state: 'stopped', stage: null, port: null, progress: null });
      return;
    }
    launch.stopping = true;
    this.verified = null;
    this.update({ state: 'stopping', stage: null, port: null, progress: null, message: null });
    await this.terminate(launch, graceful);
    if (this.launch === launch) this.launch = null;
    this.update({ state: 'stopped', stage: null, port: null, canRetry: true, message: null });
  }

  /** Re-reads engine readiness from the verified server. */
  async refreshInference(): Promise<void> {
    const connection = this.verified;
    if (!connection) return;
    try {
      const response = await this.request('/v1/inference/status');
      if (!response.ok || this.verified?.generation !== connection.generation) return;
      const body = await response.json() as { speech?: Record<string, unknown> | null; llm?: Record<string, unknown> | null };
      const speech = body.speech ?? {};
      const llm = body.llm ?? {};
      this.update({
        speech: {
          status: SPEECH_STATUSES.has(speech.status as SpeechStatus) ? speech.status as SpeechStatus : 'unknown',
          model: typeof speech.model === 'string' ? speech.model.slice(0, 200) : null,
          message: typeof speech.message === 'string' ? this.clean(speech.message, 500) : null,
          progress: speech.status === 'downloading' ? this.current.speech.progress : null,
        },
        llm: {
          status: LLM_STATUSES.has(llm.status as LlmStatus) ? llm.status as LlmStatus : 'unknown',
          model: typeof llm.model === 'string' ? llm.model.slice(0, 200) : null,
          message: typeof llm.message === 'string' ? this.clean(llm.message, 500) : null,
        },
      });
    } catch { /* Readiness is refreshed again on the next model event or user action. */ }
  }

  /** Sends one bearer-authenticated request to the verified server. Raises when it is not ready. */
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const connection = this.verified;
    if (!connection) throw new Error("The on-device server isn't running.");
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${connection.token}`);
    return this.options.fetch(`${connection.host}${path}`, { ...init, headers, redirect: 'error' });
  }

  /** Launches when a runtime exists; otherwise reports what is missing. */
  private async performStart(): Promise<void> {
    if (this.launch || (this.options.shouldRun && !this.options.shouldRun())) return;
    const runtime = await this.options.installer.installed();
    if (!runtime) {
      this.update({ state: 'notInstalled', stage: null, message: 'Set up on-device mode to download the runtime.', progress: null, port: null, canRetry: false });
      return;
    }
    await this.spawn(runtime);
  }

  /** Spawns one child and resolves once it is verified ready or has failed. */
  private spawn(runtime: RuntimeLocation): Promise<void> {
    const generation = ++this.generation;
    const instanceId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const secrets = this.options.secrets();
    const config = this.writeConfig(instanceId);
    this.update({ state: 'starting', stage: 'launch', message: 'Starting the on-device server…', port: null, progress: null, canRetry: false });
    let child: LocalChild;
    try {
      child = this.options.spawn(runtime.python, ['-B', '-E', '-s', '-m', 'whisperer_api', 'serve-local', '--config', config], { cwd: runtime.cwd, env: this.environment() });
    } catch (error) {
      this.update({ state: 'failed', stage: 'launch', message: `The on-device server could not start: ${this.clean(error instanceof Error ? error.message : 'unknown error', 200)}`, canRetry: true });
      return Promise.resolve();
    }
    let settle: (ok: boolean) => void = () => undefined;
    const settled = new Promise<boolean>((resolve) => { settle = resolve; });
    let markExited: () => void = () => undefined;
    const launch: Launch = {
      child, generation, instanceId, token, port: null, stopping: false, error: null, timer: null, settle,
      secrets: [token, secrets.speechApiKey, secrets.llmApiKey].filter((value) => value.length >= 4),
      exited: new Promise<void>((resolve) => { markExited = resolve; }),
    };
    this.launch = launch;
    child.once('exit', (code) => { markExited(); this.onExit(launch, code); });
    child.once('error', (error) => { launch.error = this.clean(error.message, 200); markExited(); this.onExit(launch, null); });
    child.stdin.on('error', () => undefined);
    // One private line; stdin then stays open so the server sees EOF only when this process goes away.
    child.stdin.write(`${JSON.stringify({ bootToken: token, speechApiKey: secrets.speechApiKey, llmApiKey: secrets.llmApiKey })}\n`);
    this.readLines(child.stdout, (line) => this.onEvent(launch, line), () => this.appendLog('Ignored an oversized server event.', launch));
    this.readLines(child.stderr, (line) => this.appendLog(line, launch), () => undefined);
    launch.timer = setTimeout(() => {
      if (this.launch !== launch || this.verified) return;
      launch.error = 'The on-device server did not start in time.';
      void this.terminate(launch, false);
    }, this.options.startupTimeoutMs ?? 120_000);
    return settled.then(() => undefined);
  }

  /** Handles one bounded JSON event from the child's stdout. */
  private onEvent(launch: Launch, line: string): void {
    if (this.launch !== launch) return;
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; }
    catch { this.appendLog(line, launch); return; }
    if (!event || typeof event !== 'object') return;
    switch (event.event) {
      case 'bind':
        if (Number.isInteger(event.port) && (event.port as number) > 0 && (event.port as number) < 65536) launch.port = event.port as number;
        break;
      case 'database':
        // A damaged on-device database was kept aside and replaced; say so in the activity log.
        if (event.status === 'reset' && typeof event.message === 'string') this.appendLog(this.clean(event.message, 300, launch), launch);
        if (!this.verified) this.update({ stage: 'database', message: 'Preparing the database…' });
        break;
      case 'ready':
        void this.verify(launch);
        break;
      case 'model':
        this.onModel(event);
        break;
      case 'error':
        launch.error = typeof event.message === 'string' ? this.clean(event.message, 300, launch) : 'The on-device server reported an error.';
        this.appendLog(launch.error, launch);
        break;
      default:
        break;
    }
  }

  /** Applies a model progress event without inventing percentages. */
  private onModel(event: Record<string, unknown>): void {
    const status = event.status === 'failed' ? 'failed' : SPEECH_STATUSES.has(event.status as SpeechStatus) ? event.status as SpeechStatus : null;
    if (!status) return;
    const completed = event.completedBytes;
    const total = event.totalBytes;
    const progress: ByteProgress | null = Number.isInteger(completed) && (completed as number) >= 0
      ? { completedBytes: completed as number, totalBytes: Number.isInteger(total) && (total as number) >= 0 ? total as number : null }
      : null;
    this.update({
      speech: {
        status,
        model: typeof event.model === 'string' ? event.model.slice(0, 200) : this.current.speech.model,
        message: typeof event.message === 'string' ? this.clean(event.message, 500) : null,
        progress: status === 'downloading' || status === 'verifying' ? progress : null,
      },
    });
    if (status === 'ready' || status === 'failed' || status === 'missing') void this.refreshInference();
  }

  /** Trusts the port only after the instance id matches and the HMAC challenge proves token possession. */
  private async verify(launch: Launch): Promise<void> {
    if (this.launch !== launch || launch.port === null) return;
    this.update({ stage: 'verify', message: 'Checking the on-device server…' });
    const host = `http://127.0.0.1:${launch.port}`;
    let trusted = false;
    try {
      const health = await this.options.fetch(`${host}/v1/health`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      const body = health.ok ? await health.json() as { service?: unknown; instanceId?: unknown } : {};
      if (body.service === 'whisperer' && body.instanceId === launch.instanceId) {
        const nonce = randomBytes(32).toString('base64url');
        const answer = await this.options.fetch(`${host}/v1/local/challenge`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce }),
        });
        const proof = answer.ok ? await answer.json() as { hmac?: unknown } : {};
        const expected = Buffer.from(createHmac('sha256', launch.token).update(nonce).digest('base64url'));
        const received = Buffer.from(typeof proof.hmac === 'string' ? proof.hmac : '');
        trusted = received.length === expected.length && timingSafeEqual(received, expected);
      }
    } catch { trusted = false; }
    if (this.launch !== launch || launch.stopping) return;
    if (!trusted) {
      launch.error = 'The local server did not prove its identity.';
      launch.stopping = true;
      this.fail(launch, 'verify', launch.error);
      void this.terminate(launch, false);
      return;
    }
    if (launch.timer) clearTimeout(launch.timer);
    this.verified = { host, token: launch.token, generation: launch.generation };
    this.startupFailures = 0;
    this.update({ state: 'ready', stage: null, message: 'Running on this device', port: launch.port, progress: null, canRetry: true });
    this.watchHealth(launch, host);
    await this.refreshInference();
    launch.settle(true);
  }

  /**
   * Checks a ready server periodically. A hang (three missed checks) kills the child, which the
   * exit handler then restarts within the budget. Ten healthy minutes restore the full budget.
   */
  private watchHealth(launch: Launch, host: string): void {
    const readyAt = Date.now();
    let misses = 0;
    let checking = false;
    launch.health = setInterval(() => {
      if (checking) return;
      if (this.launch !== launch || launch.stopping) { clearInterval(launch.health); return; }
      checking = true;
      void (async () => {
        let healthy: boolean;
        try {
          const response = await this.options.fetch(`${host}/v1/health`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
          const body = response.ok ? await response.json() as { instanceId?: unknown } : {};
          healthy = body.instanceId === launch.instanceId;
        } catch { healthy = false; }
        checking = false;
        if (this.launch !== launch || launch.stopping) return;
        if (healthy) {
          misses = 0;
          if (Date.now() - readyAt > HEALTHY_RESET_MS) this.restarts = 0;
          return;
        }
        misses += 1;
        if (misses < 3) return;
        clearInterval(launch.health);
        this.appendLog('The on-device server stopped responding; restarting it.', launch);
        void this.terminate(launch, false);
      })();
    }, this.options.healthIntervalMs ?? 20_000);
    launch.health.unref?.();
  }

  /** Handles child exit: a planned stop is quiet, a crash restarts within the bounded budget. */
  private onExit(launch: Launch, code: number | null): void {
    if (launch.timer) clearTimeout(launch.timer);
    if (launch.health) clearInterval(launch.health);
    if (this.launch !== launch) { launch.settle(false); return; }
    this.launch = null;
    const wasReady = this.verified?.generation === launch.generation;
    this.verified = null;
    if (launch.stopping) { launch.settle(false); return; }
    if (wasReady && this.restarts < (this.options.maxRestarts ?? 2)) {
      this.restarts += 1;
      this.appendLog(`The on-device server stopped (code ${code ?? 'none'}); restarting (${this.restarts} of ${this.options.maxRestarts ?? 2}).`);
      launch.settle(false);
      // Back off between automatic restarts: 1 s, then 2 s, … within the budget.
      const delayMs = (this.options.restartDelayMs ?? 1000) * 2 ** (this.restarts - 1);
      const timer = setTimeout(() => {
        if (this.launch === null && (!this.options.shouldRun || this.options.shouldRun())) void this.start();
      }, delayMs);
      timer.unref?.();
      return;
    }
    let message = wasReady ? 'Local server stopped unexpectedly' : launch.error ?? `The on-device server exited during startup (code ${code ?? 'none'}).`;
    if (!wasReady) {
      // Repeated startup failures point at a damaged runtime (a deleted package, a quarantined
      // DLL). Mark it for reinstall so the next setup repairs it instead of failing again.
      this.startupFailures += 1;
      if (this.startupFailures >= 2) {
        this.startupFailures = 0;
        this.options.installer.invalidate?.();
        message = `${message} The on-device runtime may be damaged. Set up on-device mode again to repair it.`;
      }
    }
    this.fail(launch, wasReady ? null : this.current.stage ?? 'launch', message);
  }

  /** Records a terminal failure for this launch. */
  private fail(launch: Launch, stage: LocalServerStatus['stage'], message: string): void {
    this.verified = null;
    this.update({ state: 'failed', stage, message, port: null, progress: null, canRetry: true });
    launch.settle(false);
  }

  /** Ends the owned child: stdin EOF first when graceful, then SIGTERM, then SIGKILL. Never touches other processes. */
  private async terminate(launch: Launch, graceful: boolean): Promise<void> {
    const { child } = launch;
    const wait = (ms: number): Promise<boolean> => Promise.race([launch.exited.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms).unref?.())]);
    if (child.exitCode !== null) return;
    if (graceful) {
      child.stdin.end();
      if (await wait(5000)) return;
    }
    child.kill('SIGTERM');
    if (!graceful) child.stdin.end();
    if (await wait(3000)) return;
    child.kill('SIGKILL');
    await wait(2000);
  }

  /** Writes the secret-free launch configuration atomically with owner-only permissions. */
  private writeConfig(instanceId: string): string {
    const { dataDirectory } = this.options;
    mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
    const inference = this.options.inference();
    const speech = inference.speech.provider === 'onnx'
      ? { provider: 'onnx', model: inference.speech.model }
      : { provider: 'http', baseUrl: inference.speech.baseUrl, model: inference.speech.model };
    const llm = inference.llm.provider === 'off' ? { provider: 'off' } : { provider: 'http', baseUrl: inference.llm.baseUrl, model: inference.llm.model };
    const file = join(dataDirectory, 'local.json');
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, instanceId, dataDirectory, speech, llm }, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      renameSync(temporary, file);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return file;
  }

  /** Returns the allowlisted child environment; PYTHON* and unrelated secrets never reach it. */
  private environment(): Record<string, string> {
    const environment: Record<string, string> = { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
    for (const name of ALLOWED_ENVIRONMENT) {
      const value = this.options.environment[name];
      if (typeof value === 'string') environment[name] = value;
    }
    return environment;
  }

  /** Splits a stream into lines of at most 4 KB, discarding oversized lines whole. */
  private readLines(stream: Readable, onLine: (line: string) => void, onOversized: () => void): void {
    let buffer = '';
    let discarding = false;
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      for (;;) {
        const index = buffer.indexOf('\n');
        if (index < 0) break;
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (discarding) { discarding = false; continue; }
        if (Buffer.byteLength(line) > MAX_EVENT_BYTES) { onOversized(); continue; }
        if (line.trim()) onLine(line);
      }
      if (Buffer.byteLength(buffer) > MAX_EVENT_BYTES) {
        if (!discarding) onOversized();
        discarding = true;
        buffer = '';
      }
    });
    stream.on('error', () => undefined);
  }

  /** Maps installer progress to public status, logging uv lines. */
  private installProgress(event: InstallProgress): void {
    if (event.line) this.appendLog(event.line);
    else if (event.message !== this.current.message) this.appendLog(event.message);
    this.update({ state: 'installing', stage: event.stage, message: event.message, progress: event.progress });
  }

  /** Adds one redacted, bounded line to the activity log. */
  private appendLog(line: string, launch?: Launch): void {
    const text = this.clean(line, 300, launch);
    if (!text) return;
    const log = [...this.current.log, text].slice(-MAX_LOG_LINES);
    this.update({ log });
  }

  /** Removes secrets, tokens and control characters and bounds length. */
  private clean(value: string, limit: number, launch: Launch | null = this.launch): string {
    let text = [...redact(value)].map((character) => (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character)).join('');
    for (const secret of launch?.secrets ?? []) text = text.split(secret).join('[redacted]');
    return text.trim().slice(0, limit);
  }

  /** Applies a partial status change and notifies the owner. */
  private update(change: Partial<LocalServerStatus>): void {
    this.current = { ...this.current, ...change };
    this.options.onChange(this.status());
  }
}

/** Spawns the Python child with private pipes, no shell and no detached process group. */
export const spawnLocalChild: SpawnChild = (file, args, options) => spawnProcess(file, [...args], {
  cwd: options.cwd, env: options.env, shell: false, detached: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
