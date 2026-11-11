/**
 * Release naming, ordering and feed locations shared by the desktop updater and the release tools.
 *
 * This module has no imports and uses only erasable TypeScript, so `tools/*.mjs` load it directly
 * through Node's type stripping. Change the release host here and nowhere else; docs/desktop-release.md
 * explains the procedure.
 */

/** Git forges whose release API this module can address. Gitea and GitHub share one release JSON shape. */
export type ReleaseProvider = 'gitea' | 'github'

/** Where published desktop releases live. */
export interface ReleaseFeed {
  /** Which forge API dialect to use. */
  provider: ReleaseProvider
  /** Web origin of the forge, for example `https://github.com`. */
  url: string
  /** Repository owner or organization. */
  owner: string
  /** Repository name. */
  repo: string
}

/**
 * The one release feed every build checks and every release is published to.
 *
 * A fork that publishes its own releases sets `owner` to the GitHub user or organization that hosts it. For a
 * self-hosted Gitea, use `{ provider: 'gitea', url: 'https://git.example.com', owner: '<owner>', repo: 'Whisperer' }`.
 */
export const RELEASE_FEED: ReleaseFeed = {
  provider: 'github',
  url: 'https://github.com',
  owner: 'sharukeshalagiri',
  repo: 'Whisperer',
}

/** Product prefix of every installer name. */
export const RELEASE_ASSET_PRODUCT = 'Whisperer'

/** Operating system label used in installer names, keyed by Node's `process.platform`. */
export const RELEASE_OS = { darwin: 'mac', win32: 'win', linux: 'linux' } as const

/** Installer extensions per operating system label, most preferred first. */
export const RELEASE_EXTENSIONS: Readonly<Record<ReleaseOs, readonly string[]>> = {
  mac: ['dmg'],
  win: ['exe'],
  linux: ['deb'],
}

/** Architecture spellings packagers emit, keyed by Node's `process.arch`. Debian writes x64 as amd64. */
export const RELEASE_ARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  x64: ['x64', 'amd64', 'x86_64'],
  arm64: ['arm64', 'aarch64'],
}

/** Operating system label inside an installer name. */
export type ReleaseOs = (typeof RELEASE_OS)[keyof typeof RELEASE_OS]

/** A parsed `Whisperer-<version>-<os>-<arch>.<ext>` installer name. */
export interface ReleaseAssetName {
  /** Semantic version without the tag's `v`. */
  version: string
  /** Operating system label. */
  os: ReleaseOs
  /** Architecture as written by the packager. */
  arch: string
  /** File extension without the dot. */
  ext: string
}

/** One asset of a forge release, reduced to the fields both providers return. */
export interface ForgeReleaseAsset {
  /** File name. */
  name: string
  /** Size in bytes. */
  size: number
  /** Public download URL. */
  browser_download_url: string
}

/** One forge release, reduced to the fields both providers return. */
export interface ForgeRelease {
  /** Git tag, `v<version>` under this scheme. */
  tag_name: string
  /** Human title. */
  name: string | null
  /** Unpublished draft. */
  draft: boolean
  /** Marked as a prerelease. */
  prerelease: boolean
  /** Publication instant, or null for a draft. */
  published_at: string | null
  /** Release page on the forge. */
  html_url: string
  /** Uploaded files. */
  assets: ForgeReleaseAsset[]
}

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/
const ASSET_NAME = /^Whisperer-(.+)-(mac|win|linux)-([a-z0-9_]+)\.([a-z0-9]+)$/i

/**
 * Parses a Semantic Versioning 2.0.0 string.
 *
 * Args:
 *   version: Version without a leading `v`.
 * Returns: Numeric core and prerelease identifiers, or null when the string is not a semantic version.
 */
export function parseVersion(
  version: string,
): { core: [number, number, number]; prerelease: string[] } | null {
  const match = SEMVER.exec(version)
  if (!match) return null
  const [, major, minor, patch, prerelease] = match
  return {
    core: [Number(major), Number(minor), Number(patch)],
    prerelease: prerelease ? prerelease.split('.') : [],
  }
}

/**
 * Orders two semantic versions by SemVer 2.0.0 precedence. A few lines of the specification avoid a runtime dependency.
 *
 * Args:
 *   left: First version.
 *   right: Second version.
 * Returns: A negative number, zero or a positive number as left sorts before, equal to or after right.
 * Raises: Error when either string is not a semantic version.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) throw new Error(`Not a semantic version: ${a ? right : left}`)
  for (const index of [0, 1, 2] as const)
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index]
  // A version without prerelease identifiers outranks any prerelease of the same core.
  if (!a.prerelease.length || !b.prerelease.length) return b.prerelease.length - a.prerelease.length
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const x = a.prerelease[index]
    const y = b.prerelease[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) return Number(x) - Number(y)
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

/**
 * Names the Git tag of a release.
 *
 * Args:
 *   version: Semantic version from package.json.
 * Returns: The tag, `v<version>`.
 */
export function releaseTag(version: string): string {
  return `v${version}`
}

/**
 * Reads the version a release tag names.
 *
 * Args:
 *   tag: Git tag such as `v0.2.0-beta.1`.
 * Returns: The semantic version, or null when the tag does not follow the scheme.
 */
export function versionFromTag(tag: string): string | null {
  return tag.startsWith('v') && parseVersion(tag.slice(1)) ? tag.slice(1) : null
}

/**
 * Parses an installer name of the form `Whisperer-<version>-<os>-<arch>.<ext>`.
 *
 * Args:
 *   name: File name without directories.
 * Returns: Its parts, or null when the name does not follow the scheme.
 */
export function parseAssetName(name: string): ReleaseAssetName | null {
  const [, version, os, arch, ext] = ASSET_NAME.exec(name) ?? []
  if (!version || !os || !arch || !ext || !parseVersion(version)) return null
  return {
    version,
    os: os.toLowerCase() as ReleaseOs,
    arch: arch.toLowerCase(),
    ext: ext.toLowerCase(),
  }
}

/**
 * Picks the installer of one release that this machine can run.
 *
 * Args:
 *   release: A forge release.
 *   platform: Node's `process.platform`.
 *   arch: Node's `process.arch`.
 * Returns: The matching asset, or null when the release has no installer for this platform and architecture.
 */
export function installerFor(
  release: ForgeRelease,
  platform: string,
  arch: string,
): ForgeReleaseAsset | null {
  const os = RELEASE_OS[platform as keyof typeof RELEASE_OS]
  const version = versionFromTag(release.tag_name)
  const arches = RELEASE_ARCH_ALIASES[arch] ?? [arch]
  if (!os || !version) return null
  const candidates = release.assets.filter((asset) => {
    const parsed = parseAssetName(asset.name)
    return (
      parsed &&
      parsed.version === version &&
      parsed.os === os &&
      arches.includes(parsed.arch) &&
      RELEASE_EXTENSIONS[os].includes(parsed.ext)
    )
  })
  candidates.sort(
    (a, b) =>
      RELEASE_EXTENSIONS[os].indexOf(parseAssetName(a.name)!.ext) -
      RELEASE_EXTENSIONS[os].indexOf(parseAssetName(b.name)!.ext),
  )
  return candidates[0] ?? null
}

/**
 * Chooses the newest published release with an installer for this machine. Prereleases count: the product ships betas.
 *
 * Args:
 *   releases: Releases as returned by the forge, in any order.
 *   platform: Node's `process.platform`.
 *   arch: Node's `process.arch`.
 * Returns: The release with the highest version, newest publication breaking ties, or null when none qualifies.
 */
export function newestInstallable(
  releases: readonly ForgeRelease[],
  platform: string,
  arch: string,
): { release: ForgeRelease; version: string; asset: ForgeReleaseAsset } | null {
  let best: { release: ForgeRelease; version: string; asset: ForgeReleaseAsset } | null = null
  for (const release of releases) {
    const version = versionFromTag(release.tag_name)
    const asset = installerFor(release, platform, arch)
    if (release.draft || !version || !asset) continue
    const order = best ? compareVersions(version, best.version) : 1
    if (
      order > 0 ||
      (order === 0 && (release.published_at ?? '') > (best?.release.published_at ?? ''))
    )
      best = { release, version, asset }
  }
  return best
}

/** Endpoints and authorization for one forge, derived from a feed. */
export interface ReleaseApi {
  /** Lists the most recent releases, newest first, prereleases included. */
  listUrl: string
  /** Creates a release with a JSON body of tag_name, target_commitish, name, body, draft and prerelease. */
  createUrl: string
  /** Uploads one file to a created release. */
  uploadUrl(releaseId: number, name: string): string
  /** Whether an upload is a multipart form with an `attachment` field (Gitea) or the raw file body (GitHub). */
  uploadAsForm: boolean
  /** Authorization header value for a personal access token. */
  authorization(token: string): string
}

/**
 * Derives the release API of a feed. Add a provider by adding a branch here; nothing else knows the dialects.
 *
 * Args:
 *   feed: Release host and repository.
 *   limit: How many recent releases a list request returns.
 * Returns: Endpoint builders and the authorization scheme.
 */
export function releaseApi(feed: ReleaseFeed, limit = 30): ReleaseApi {
  const path = `repos/${encodeURIComponent(feed.owner)}/${encodeURIComponent(feed.repo)}/releases`
  const origin = feed.url.replace(/\/+$/, '')
  if (feed.provider === 'github') {
    // github.com serves its API and uploads from separate hosts; GitHub Enterprise Server uses /api/v3 and /api/uploads.
    const hosted = new URL(origin).hostname === 'github.com'
    const api = hosted ? 'https://api.github.com' : `${origin}/api/v3`
    const uploads = hosted ? 'https://uploads.github.com' : `${origin}/api/uploads`
    return {
      listUrl: `${api}/${path}?per_page=${limit}`,
      createUrl: `${api}/${path}`,
      uploadUrl: (id, name) => `${uploads}/${path}/${id}/assets?name=${encodeURIComponent(name)}`,
      uploadAsForm: false,
      authorization: (token) => `Bearer ${token}`,
    }
  }
  return {
    listUrl: `${origin}/api/v1/${path}?limit=${limit}`,
    createUrl: `${origin}/api/v1/${path}`,
    uploadUrl: (id, name) =>
      `${origin}/api/v1/${path}/${id}/assets?name=${encodeURIComponent(name)}`,
    uploadAsForm: true,
    authorization: (token) => `token ${token}`,
  }
}
