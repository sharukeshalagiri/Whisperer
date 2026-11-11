import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gunzipSync, inflateRawSync } from 'node:zlib';

import type { ByteProgress } from '../../shared/contracts';

/** One pinned upstream uv release archive. */
export interface RuntimeAsset {
  url: string;
  sha256: string;
  size: number;
  archive: 'tar.gz' | 'zip';
  binary: string;
}

/** Pinned runtime versions and verified download digests shipped with the desktop. */
export interface RuntimeManifest {
  version: 1;
  uv: { version: string; source: string; assets: Record<string, RuntimeAsset> };
  python: { version: string };
  api: { package: string; extras: string[] };
  minimumFreeBytes: number;
}

/** Runs one program with an argument array; never through a shell. */
export type RunCommand = (
  file: string,
  args: readonly string[],
  options: { cwd: string; env: Record<string, string>; signal: AbortSignal; onLine?: (line: string) => void },
) => Promise<void>;

/** Minimal streaming fetch used for the single uv download. */
export type DownloadFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** Configures one runtime installer. */
export interface RuntimeInstallerOptions {
  manifest: RuntimeManifest;
  /** `${process.platform}-${process.arch}`. */
  platformKey: string;
  /** Private per-user runtime directory, for example `<userData>/runtime`. */
  root: string;
  /** Read-only bundled API project: root `pyproject.toml`, `uv.lock` and `apps/api`. */
  apiSource: string;
  fetch: DownloadFetch;
  run: RunCommand;
  freeBytes: (path: string) => number;
  /** Parent environment; only allowlisted entries reach uv. */
  environment: Record<string, string | undefined>;
  /** Abort a download that sends no bytes for this long. Default 60 s. */
  downloadIdleMs?: number;
}

/** Interpreter and working directory of a complete runtime. */
export interface RuntimeLocation {
  python: string;
  cwd: string;
  key: string;
}

/** One installer progress update. */
export interface InstallProgress {
  stage: 'uv' | 'python' | 'packages';
  message: string;
  progress: ByteProgress | null;
  /** A sanitized uv output line, when the update carries one. */
  line?: string;
}

/** Stage-labelled installer failure with a user-facing message. */
export class RuntimeInstallError extends Error {
  /** Args: stage names the failed step; message is user-facing. */
  constructor(readonly stage: InstallProgress['stage'] | null, message: string) { super(message); this.name = 'RuntimeInstallError'; }
}

/** Environment names uv may inherit: OS basics, locale and proxies. Everything else, including UV_* and PYTHON*, is dropped. */
const ALLOWED_ENVIRONMENT = [
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'windir', 'PATH', 'Path',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
];
const MARKER = 'whisperer-runtime.json';

/** Installs pinned uv, a uv-managed Python and locked binary wheels into an isolated per-user directory. */
export class RuntimeInstaller {
  private flight: Promise<RuntimeLocation> | null = null;

  /** Args: options supplies every side effect so the installer runs without Electron. */
  constructor(readonly options: RuntimeInstallerOptions) {}

  /** Forgets the installed runtime so the next setup reinstalls it. Its files are replaced then. */
  invalidate(): void {
    rmSync(join(this.options.root, 'envs', this.key(), MARKER), { force: true });
  }

  /** Returns the complete runtime matching this build, or null when setup is needed. Never downloads. */
  async installed(): Promise<RuntimeLocation | null> {
    const key = this.key();
    const directory = join(this.options.root, 'envs', key);
    const location = this.location(key);
    try {
      const marker = JSON.parse(readFileSync(join(directory, MARKER), 'utf8')) as { key?: unknown };
      return marker.key === key && existsSync(location.python) ? location : null;
    } catch {
      return null;
    }
  }

  /** Installs any missing piece. Concurrent callers share one attempt. Raises RuntimeInstallError. */
  install(signal: AbortSignal, onProgress: (event: InstallProgress) => void): Promise<RuntimeLocation> {
    this.flight ??= this.performInstall(signal, onProgress).finally(() => { this.flight = null; });
    return this.flight;
  }

  /** Runs the three stages in order, keeping the previous complete runtime until the new one is ready. */
  private async performInstall(signal: AbortSignal, onProgress: (event: InstallProgress) => void): Promise<RuntimeLocation> {
    const existing = await this.installed();
    if (existing) return existing;
    const asset = this.options.manifest.uv.assets[this.options.platformKey];
    if (!asset) throw new RuntimeInstallError(null, `On-device mode isn't available for this computer (${this.options.platformKey}).`);
    mkdirSync(this.options.root, { recursive: true, mode: 0o700 });
    if (this.options.freeBytes(this.options.root) < this.options.manifest.minimumFreeBytes) {
      throw new RuntimeInstallError(null, `Not enough free disk space (need about ${Math.ceil(this.options.manifest.minimumFreeBytes / 2 ** 30)} GB).`);
    }
    const uv = await this.stage('uv', signal, () => this.installUv(asset, signal, onProgress));
    const environment = this.environment();
    const { version } = this.options.manifest.python;
    await this.stage('python', signal, async () => {
      onProgress({ stage: 'python', message: `Installing Python ${version}…`, progress: null });
      await this.options.run(uv, ['python', 'install', version, '--no-bin', '--no-registry', '--no-config', '--system-certs', '--no-progress', '--color', 'never'], {
        cwd: this.options.root, env: environment, signal, onLine: (line) => onProgress({ stage: 'python', message: `Installing Python ${version}…`, progress: null, line }),
      });
    });
    return this.stage('packages', signal, async () => {
      onProgress({ stage: 'packages', message: 'Installing packages…', progress: null });
      const key = this.key();
      const envs = join(this.options.root, 'envs');
      mkdirSync(envs, { recursive: true, mode: 0o700 });
      const partial = join(envs, `${key}.partial-${randomUUID()}`);
      try {
        const { api } = this.options.manifest;
        await this.options.run(uv, [
          'sync', '--locked', '--no-dev', '--no-build', '--no-install-workspace', '--package', api.package, ...api.extras.flatMap((extra) => ['--extra', extra]),
          '--managed-python', '--no-python-downloads', '--python', version, '--no-config', '--system-certs', '--no-progress', '--color', 'never',
          '--project', this.options.apiSource,
        ], {
          cwd: this.options.root, env: { ...environment, UV_PROJECT_ENVIRONMENT: partial }, signal,
          onLine: (line) => onProgress({ stage: 'packages', message: 'Installing packages…', progress: null, line }),
        });
        signal.throwIfAborted();
        if (!existsSync(this.pythonIn(partial))) throw new Error('the environment has no Python interpreter');
        writeFileSync(join(partial, MARKER), JSON.stringify({ key, uv: this.options.manifest.uv.version, python: version }), { mode: 0o600 });
        const target = join(envs, key);
        rmSync(target, { force: true, recursive: true });
        renameSync(partial, target);
      } finally {
        rmSync(partial, { force: true, recursive: true });
      }
      this.removeStaleEnvironments(key);
      return this.location(key);
    });
  }

  /** Runs one stage and converts any failure into a stage-labelled message. */
  private async stage<T>(stage: InstallProgress['stage'], signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    try {
      signal.throwIfAborted();
      return await work();
    } catch (error) {
      if (signal.aborted) throw new RuntimeInstallError(stage, 'Setup was cancelled.');
      if (error instanceof RuntimeInstallError) throw error;
      const reason = reasonOf(error);
      const label = stage === 'uv' ? 'Runtime download failed (uv)' : stage === 'python' ? 'Python install failed' : 'Package install failed';
      throw new RuntimeInstallError(stage, `${label}: ${reason}.`);
    }
  }

  /** Downloads the pinned archive over HTTPS, checks size and SHA-256, then atomically places the binary. */
  private async installUv(asset: RuntimeAsset, signal: AbortSignal, onProgress: (event: InstallProgress) => void): Promise<string> {
    const { version } = this.options.manifest.uv;
    const directory = join(this.options.root, 'uv', version);
    const binary = join(directory, asset.binary);
    if (existsSync(binary)) return binary;
    if (new URL(asset.url).protocol !== 'https:') throw new RuntimeInstallError('uv', 'Runtime download failed (uv): the pinned download must use HTTPS.');
    const message = `Downloading uv ${version}…`;
    onProgress({ stage: 'uv', message, progress: { completedBytes: 0, totalBytes: asset.size } });
    const response = await this.options.fetch(asset.url, { signal });
    if (!response.ok || !response.body) throw new Error(`the server answered ${response.status}`);
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    let received = 0;
    const reader = response.body.getReader();
    const idleMs = this.options.downloadIdleMs ?? 60_000;
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stalled = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('the download stalled')), idleMs); });
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await Promise.race([reader.read(), stalled]); }
      catch (error) { void reader.cancel().catch(() => undefined); throw error; }
      finally { clearTimeout(timer); }
      const { done, value } = chunk;
      if (done) break;
      received += value.byteLength;
      if (received > asset.size) { await reader.cancel(); throw new Error('the download was larger than expected'); }
      hash.update(value);
      chunks.push(Buffer.from(value));
      onProgress({ stage: 'uv', message, progress: { completedBytes: received, totalBytes: asset.size } });
    }
    if (received !== asset.size || hash.digest('hex') !== asset.sha256) throw new Error('the download did not match its pinned checksum');
    const staging = join(this.options.root, 'uv', `${version}.partial-${randomUUID()}`);
    mkdirSync(staging, { recursive: true, mode: 0o700 });
    try {
      extractSingleFile(Buffer.concat(chunks), asset.archive, asset.binary, join(staging, asset.binary));
      rmSync(directory, { force: true, recursive: true });
      renameSync(staging, directory);
    } finally {
      rmSync(staging, { force: true, recursive: true });
    }
    return binary;
  }

  /** Builds the allowlisted environment and the private uv locations. */
  private environment(): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const name of ALLOWED_ENVIRONMENT) {
      const value = this.options.environment[name];
      if (typeof value === 'string') environment[name] = value;
    }
    return {
      ...environment,
      UV_CACHE_DIR: join(this.options.root, 'cache'),
      UV_PYTHON_INSTALL_DIR: join(this.options.root, 'python'),
      UV_NO_PROGRESS: '1',
    };
  }

  /** Identifies a runtime by pinned versions, platform and the bundled project's lock inputs. */
  private key(): string {
    const hash = createHash('sha256');
    const { manifest, platformKey, apiSource } = this.options;
    hash.update(JSON.stringify({ uv: manifest.uv.version, python: manifest.python.version, api: manifest.api, platformKey }));
    for (const file of ['pyproject.toml', 'uv.lock', join('apps', 'api', 'pyproject.toml')]) {
      try { hash.update(readFileSync(join(apiSource, file))); } catch { hash.update(`missing:${file}`); }
    }
    return hash.digest('hex').slice(0, 16);
  }

  /** Returns where a complete environment keeps its interpreter. */
  private pythonIn(environment: string): string {
    return this.options.platformKey.startsWith('win32-') ? join(environment, 'Scripts', 'python.exe') : join(environment, 'bin', 'python');
  }

  /** Builds the location of one environment key. */
  private location(key: string): RuntimeLocation {
    return { key, python: this.pythonIn(join(this.options.root, 'envs', key)), cwd: join(this.options.apiSource, 'apps', 'api', 'src') };
  }

  /** Deletes environments from previous builds and abandoned partial installs. */
  private removeStaleEnvironments(current: string): void {
    const envs = join(this.options.root, 'envs');
    for (const entry of readdirSync(envs)) if (entry !== current) rmSync(join(envs, entry), { force: true, recursive: true });
  }
}

/** Extracts one regular file named `binary`, at most one directory deep, from a tar.gz or zip archive. Raises when it is absent. */
export function extractSingleFile(archive: Buffer, kind: RuntimeAsset['archive'], binary: string, output: string): void {
  const content = kind === 'zip' ? zipEntry(archive, binary) : tarEntry(gunzipSync(archive), binary);
  if (!content) throw new Error(`the archive did not contain ${binary}`);
  writeFileSync(output, content, { flag: 'wx', mode: 0o755 });
  chmodSync(output, 0o755);
}

/** Matches `binary` or `<one directory>/binary`, rejecting traversal. */
function matches(name: string, binary: string): boolean {
  const parts = name.split('/').filter(Boolean);
  return !parts.includes('..') && parts.length <= 2 && parts.at(-1) === binary && basename(name) === binary;
}

/** Reads one regular file from an uncompressed ustar archive. */
function tarEntry(tar: Buffer, binary: string): Buffer | null {
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number): string => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const size = Number.parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1) || '0';
    const prefix = field(257, 6).startsWith('ustar') ? field(345, 155) : '';
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    const start = offset + 512;
    longName = null;
    if (!Number.isFinite(size) || size < 0 || start + size > tar.length) throw new Error('the archive was malformed');
    if (type === 'L') longName = tar.subarray(start, start + size).toString('utf8').replace(/\0.*$/s, '');
    else if (type === '0' && matches(name, binary)) return Buffer.from(tar.subarray(start, start + size));
    offset = start + Math.ceil(size / 512) * 512;
  }
  return null;
}

/** Reads one stored or deflated file through the zip central directory. */
function zipEntry(zip: Buffer, binary: string): Buffer | null {
  let end = -1;
  for (let index = zip.length - 22; index >= Math.max(0, zip.length - 22 - 65535); index -= 1) {
    if (zip.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw new Error('the archive was malformed');
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  for (let entry = 0; entry < count; entry += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('the archive was malformed');
    const method = zip.readUInt16LE(offset + 10);
    const compressed = zip.readUInt32LE(offset + 20);
    const size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (matches(name, binary)) {
      if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('the archive was malformed');
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + compressed);
      const content = method === 8 ? inflateRawSync(data) : method === 0 ? Buffer.from(data) : null;
      if (!content || content.length !== size) throw new Error('the archive was malformed');
      return content;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** Returns a short single-line reason without uv's `error:` prefix or terminal escapes. */
function reasonOf(error: unknown): string {
  const raw = error instanceof Error && error.message ? error.message : 'unknown error';
  const line = raw.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '').split(/\r?\n/).map((part) => part.trim()).filter(Boolean).at(-1) ?? 'unknown error';
  return line.replace(/^error:\s*/i, '').replace(/\.$/, '').slice(0, 200);
}

/** Spawns a program with an argument array, no shell and a bounded output tail; kills it on abort. */
export const spawnCommand: RunCommand = (file, args, options) => new Promise<void>((resolve, reject) => {
  if (options.signal.aborted) { reject(new Error('cancelled')); return; }
  const child = spawn(file, [...args], { cwd: options.cwd, env: options.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const tail: string[] = [];
  const onData = (chunk: Buffer): void => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      tail.push(trimmed.slice(0, 300));
      if (tail.length > 20) tail.shift();
      options.onLine?.(trimmed.slice(0, 300));
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const abort = (): void => { child.kill(); };
  options.signal.addEventListener('abort', abort, { once: true });
  child.once('error', (error) => { options.signal.removeEventListener('abort', abort); reject(error); });
  child.once('close', (code) => {
    options.signal.removeEventListener('abort', abort);
    if (options.signal.aborted) reject(new Error('cancelled'));
    else if (code === 0) resolve();
    else reject(new Error(tail.filter((line) => /error|failed|no matching|not found|unable/i.test(line)).at(-1) ?? tail.at(-1) ?? `exited with code ${code}`));
  });
});

/** Reports free bytes on the volume holding `path`, or Infinity when the OS cannot say. */
export function freeDiskBytes(path: string): number {
  try {
    const stats = statfsSync(path);
    return stats.bavail * stats.bsize;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
