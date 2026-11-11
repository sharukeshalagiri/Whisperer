import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, test } from 'vitest';

import { extractSingleFile, RuntimeInstaller, type RuntimeManifest, type RunCommand } from './RuntimeInstaller';

const directories: string[] = [];

/** Creates a disposable directory removed after each test. */
function temporary(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

/** Builds one ustar header plus padded content. */
function tarEntry(name: string, content: Buffer, type = '0'): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000755\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.write('        ', 148);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

/** Builds a gzip-compressed tar archive with the supplied entries. */
function tarGz(entries: Array<[string, Buffer, string?]>): Buffer {
  return gzipSync(Buffer.concat([...entries.map(([name, content, type]) => tarEntry(name, content, type)), Buffer.alloc(1024)]));
}

/** Builds a deflate zip archive with the supplied entries. */
function zip(entries: Array<[string, Buffer]>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = deflateRawSync(content);
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Creates a minimal API source tree the installer copies hashes from. */
function apiSource(): string {
  const root = temporary('whisperer-api-source-');
  mkdirSync(join(root, 'apps', 'api', 'src', 'whisperer_api'), { recursive: true });
  writeFileSync(join(root, 'pyproject.toml'), '[project]\nname = "workspace"\n');
  writeFileSync(join(root, 'uv.lock'), 'version = 1\n');
  writeFileSync(join(root, 'apps', 'api', 'pyproject.toml'), '[project]\nname = "whisperer-api"\n');
  return root;
}

/** Builds a manifest whose single linux-x64 asset matches the supplied archive. */
function manifest(archive: Buffer, kind: 'tar.gz' | 'zip' = 'tar.gz'): RuntimeManifest {
  return {
    version: 1,
    uv: {
      version: '0.13.1',
      source: 'https://example.test/uv',
      assets: {
        'linux-x64': {
          url: 'https://downloads.example.test/uv.tgz',
          sha256: createHash('sha256').update(archive).digest('hex'),
          size: archive.length,
          archive: kind,
          binary: kind === 'zip' ? 'uv.exe' : 'uv',
        },
      },
    },
    python: { version: '3.12.15' },
    api: { package: 'whisperer-api', extras: ['local'] },
    minimumFreeBytes: 1024,
  };
}

/** Serves one archive body through a streaming fetch response. */
function serve(body: Buffer, seen: string[] = []): (url: string, init?: { signal?: AbortSignal }) => Promise<Response> {
  return async (url, init) => {
    seen.push(url);
    init?.signal?.throwIfAborted();
    return new Response(new Uint8Array(body), { status: 200, headers: { 'Content-Length': String(body.length) } });
  };
}

/** Records uv invocations and creates the interpreter the real sync would create. */
function recorder(calls: Array<{ file: string; args: string[]; env: Record<string, string> }>): RunCommand {
  return async (file, args, options) => {
    calls.push({ file, args: [...args], env: { ...options.env } });
    if (args[0] === 'sync') {
      const python = join(options.env.UV_PROJECT_ENVIRONMENT!, 'bin', 'python');
      mkdirSync(join(python, '..'), { recursive: true });
      writeFileSync(python, '');
    }
    options.onLine?.('Resolved 30 packages');
  };
}

describe('extractSingleFile', () => {
  test('extracts only the named binary from tar.gz and zip archives', () => {
    const output = temporary('whisperer-extract-');
    extractSingleFile(tarGz([['uv-x86_64-unknown-linux-gnu/', Buffer.alloc(0), '5'], ['uv-x86_64-unknown-linux-gnu/uvx', Buffer.from('x')], ['uv-x86_64-unknown-linux-gnu/uv', Buffer.from('binary')]]), 'tar.gz', 'uv', join(output, 'uv'));
    expect(readFileSync(join(output, 'uv'), 'utf8')).toBe('binary');
    extractSingleFile(zip([['uvx.exe', Buffer.from('x')], ['uv.exe', Buffer.from('windows binary')]]), 'zip', 'uv.exe', join(output, 'uv.exe'));
    expect(readFileSync(join(output, 'uv.exe'), 'utf8')).toBe('windows binary');
  });

  test('rejects archives without the binary or with only a link of that name', () => {
    const output = temporary('whisperer-extract-');
    expect(() => extractSingleFile(tarGz([['uv/uvx', Buffer.from('x')]]), 'tar.gz', 'uv', join(output, 'uv'))).toThrow(/did not contain uv/);
    expect(() => extractSingleFile(tarGz([['uv/uv', Buffer.alloc(0), '2']]), 'tar.gz', 'uv', join(output, 'uv'))).toThrow(/did not contain uv/);
    expect(existsSync(join(output, 'uv'))).toBe(false);
  });
});

describe('RuntimeInstaller', () => {
  test('installs a hash-verified uv, pinned Python and locked binary wheels with argument arrays and an allowlisted environment', async () => {
    const archive = tarGz([['uv-x86_64-unknown-linux-gnu/uv', Buffer.from('uv binary')]]);
    const root = temporary('whisperer-runtime-');
    const calls: Array<{ file: string; args: string[]; env: Record<string, string> }> = [];
    const progress: string[] = [];
    const installer = new RuntimeInstaller({
      manifest: manifest(archive), platformKey: 'linux-x64', root, apiSource: apiSource(),
      fetch: serve(archive), run: recorder(calls), freeBytes: () => 10 ** 12,
      environment: { HOME: '/home/user', PATH: '/usr/bin', AWS_SECRET_ACCESS_KEY: 'do-not-pass', HTTPS_PROXY: 'http://proxy.test:3128' },
    });

    expect(await installer.installed()).toBeNull();
    const location = await installer.install(new AbortController().signal, (event) => progress.push(`${event.stage}:${event.message}`));

    expect(location.python.startsWith(root)).toBe(true);
    expect(location.cwd).toBe(join(installer.options.apiSource, 'apps', 'api', 'src'));
    const uv = calls[0]!.file;
    expect(readFileSync(uv, 'utf8')).toBe('uv binary');
    if (process.platform !== 'win32') expect(statSync(uv).mode & 0o111).not.toBe(0);
    expect(calls.map((call) => call.file)).toEqual([uv, uv]);
    expect(calls[0]!.args).toEqual(['python', 'install', '3.12.15', '--no-bin', '--no-registry', '--no-config', '--system-certs', '--no-progress', '--color', 'never']);
    expect(calls[1]!.args).toEqual([
      'sync', '--locked', '--no-dev', '--no-build', '--no-install-workspace', '--package', 'whisperer-api', '--extra', 'local',
      '--managed-python', '--no-python-downloads', '--python', '3.12.15', '--no-config', '--system-certs', '--no-progress', '--color', 'never',
      '--project', installer.options.apiSource,
    ]);
    for (const call of calls) {
      expect(call.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(call.env.HTTPS_PROXY).toBe('http://proxy.test:3128');
      expect(call.env.UV_CACHE_DIR).toBe(join(root, 'cache'));
      expect(call.env.UV_PYTHON_INSTALL_DIR).toBe(join(root, 'python'));
    }
    expect(progress).toEqual(expect.arrayContaining(['uv:Downloading uv 0.13.1…', 'python:Installing Python 3.12.15…', 'packages:Installing packages…']));
    expect(await installer.installed()).toEqual(location);
  });

  test('rejects a download whose hash does not match and leaves no installed runtime', async () => {
    const archive = tarGz([['uv/uv', Buffer.from('uv binary')]]);
    const root = temporary('whisperer-runtime-');
    const installer = new RuntimeInstaller({
      manifest: manifest(archive), platformKey: 'linux-x64', root, apiSource: apiSource(),
      fetch: serve(tarGz([['uv/uv', Buffer.from('tampered')]])), run: recorder([]), freeBytes: () => 10 ** 12, environment: {},
    });

    await expect(installer.install(new AbortController().signal, () => undefined)).rejects.toThrow(/Runtime download failed \(uv\): the download did not match its pinned checksum/);
    expect(await installer.installed()).toBeNull();
    expect(existsSync(join(root, 'uv', '0.13.1'))).toBe(false);
  });

  test('refuses unsupported platforms, plain HTTP assets and low disk space before downloading', async () => {
    const archive = tarGz([['uv/uv', Buffer.from('uv')]]);
    const seen: string[] = [];
    const options = { manifest: manifest(archive), root: temporary('whisperer-runtime-'), apiSource: apiSource(), fetch: serve(archive, seen), run: recorder([]), environment: {} };
    await expect(new RuntimeInstaller({ ...options, platformKey: 'linux-ia32', freeBytes: () => 10 ** 12 }).install(new AbortController().signal, () => undefined)).rejects.toThrow(/isn't available for this computer/);
    await expect(new RuntimeInstaller({ ...options, platformKey: 'linux-x64', freeBytes: () => 10 }).install(new AbortController().signal, () => undefined)).rejects.toThrow(/Not enough free disk space/);
    const insecure = manifest(archive);
    insecure.uv.assets['linux-x64']!.url = 'http://downloads.example.test/uv.tgz';
    await expect(new RuntimeInstaller({ ...options, manifest: insecure, platformKey: 'linux-x64', freeBytes: () => 10 ** 12 }).install(new AbortController().signal, () => undefined)).rejects.toThrow(/HTTPS/);
    expect(seen).toEqual([]);
  });

  test('cancellation stops the install without marking it complete', async () => {
    const archive = tarGz([['uv/uv', Buffer.from('uv')]]);
    const controller = new AbortController();
    const installer = new RuntimeInstaller({
      manifest: manifest(archive), platformKey: 'linux-x64', root: temporary('whisperer-runtime-'), apiSource: apiSource(),
      fetch: serve(archive), freeBytes: () => 10 ** 12, environment: {},
      run: async (_file, args, options) => { if (args[0] === 'sync') { controller.abort(); options.signal.throwIfAborted(); } },
    });

    await expect(installer.install(controller.signal, () => undefined)).rejects.toThrow(/cancelled/i);
    expect(await installer.installed()).toBeNull();
  });

  test('names the failing stage when uv reports an error', async () => {
    const archive = tarGz([['uv/uv', Buffer.from('uv')]]);
    const installer = new RuntimeInstaller({
      manifest: manifest(archive), platformKey: 'linux-x64', root: temporary('whisperer-runtime-'), apiSource: apiSource(),
      fetch: serve(archive), freeBytes: () => 10 ** 12, environment: {},
      run: async (_file, args) => { if (args[0] === 'python') throw new Error('error: Failed to download https://example.test/python: network unreachable'); },
    });

    await expect(installer.install(new AbortController().signal, () => undefined)).rejects.toThrow(/^Python install failed: .*network unreachable/);
  });

  test('gives up on a download that stops sending bytes', async () => {
    const archive = tarGz([['uv/uv', Buffer.from('uv')]]);
    const installer = new RuntimeInstaller({
      manifest: manifest(archive), platformKey: 'linux-x64', root: temporary('whisperer-runtime-'), apiSource: apiSource(),
      fetch: async () => new Response(new ReadableStream({ start: (controller) => controller.enqueue(new Uint8Array([1])) })),
      run: recorder([]), freeBytes: () => 10 ** 12, environment: {}, downloadIdleMs: 30,
    });

    await expect(installer.install(new AbortController().signal, () => undefined)).rejects.toThrow(/Runtime download failed \(uv\): the download stalled/);
  });
});
