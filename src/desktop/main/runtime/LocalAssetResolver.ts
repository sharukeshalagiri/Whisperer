import { realpath } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

/** MIME types intentionally permitted by the packaged local application protocol. */
export const LOCAL_ASSET_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

/** Resolves a `whisperer://local` request only when its real file stays inside packaged assets. */
export async function resolveLocalAsset(assetRoot: string, requestUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'whisperer:' || url.hostname !== 'local') {
    return null;
  }

  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const root = await resolveRealPath(assetRoot);
  if (root === null || !Object.hasOwn(LOCAL_ASSET_TYPES, extname(requestedPath).toLowerCase())) {
    return null;
  }

  const candidate = resolve(root, `.${requestedPath}`);
  const asset = await resolveRealPath(candidate);
  if (asset === null || escapesRoot(root, asset)) {
    return null;
  }
  return asset;
}

/** Returns the MIME type allowed for a resolved local asset. */
export function localAssetType(assetPath: string): string | null {
  return LOCAL_ASSET_TYPES[extname(assetPath).toLowerCase()] ?? null;
}

/** Resolves a path and turns inaccessible paths into an authorization-safe null result. */
async function resolveRealPath(value: string): Promise<string | null> {
  try {
    return await realpath(value);
  } catch {
    return null;
  }
}

/** Returns whether a real asset is outside an already-real packaged root. */
function escapesRoot(root: string, asset: string): boolean {
  const pathFromRoot = relative(root, asset);
  return pathFromRoot === '' || pathFromRoot === '..' || pathFromRoot.startsWith('../') || pathFromRoot.startsWith('..\\');
}
