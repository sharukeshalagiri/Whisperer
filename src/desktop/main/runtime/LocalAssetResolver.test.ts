import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { resolveLocalAsset } from './LocalAssetResolver';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('resolveLocalAsset', () => {
  test('resolves a local packaged renderer asset', async () => {
    const root = createRoot();
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets', 'app.js'), 'export {}');

    await expect(resolveLocalAsset(root, 'whisperer://local/assets/app.js')).resolves.toBe(
      join(root, 'assets', 'app.js'),
    );
  });

  test('rejects other hosts, traversal, and symlinks that escape packaged assets', async () => {
    const root = createRoot();
    const outside = mkdtempSync(join(tmpdir(), 'whisperer-outside-'));
    temporaryDirectories.push(outside);
    writeFileSync(join(outside, 'secret.js'), 'secret');
    symlinkSync(join(outside, 'secret.js'), join(root, 'escape.js'));

    await expect(resolveLocalAsset(root, 'whisperer://remote/escape.js')).resolves.toBeNull();
    await expect(resolveLocalAsset(root, 'whisperer://local/../escape.js')).resolves.toBeNull();
    await expect(resolveLocalAsset(root, 'whisperer://local/escape.js')).resolves.toBeNull();
  });
});

function createRoot(): string {
  // macOS exposes temporary directories through /var -> /private/var; the resolver returns real paths.
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'whisperer-assets-')));
  temporaryDirectories.push(directory);
  return directory;
}
