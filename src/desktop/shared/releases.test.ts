import { describe, expect, test } from 'vitest'

import {
  compareVersions,
  installerFor,
  newestInstallable,
  RELEASE_FEED,
  parseAssetName,
  releaseApi,
  versionFromTag,
  type ForgeRelease,
} from './releases'

/** Builds a forge release whose assets follow the naming scheme. */
function release(
  version: string,
  assets: string[],
  extra: Partial<ForgeRelease> = {},
): ForgeRelease {
  return {
    tag_name: `v${version}`,
    name: `Whisperer ${version}`,
    draft: false,
    prerelease: version.includes('-'),
    published_at: '2026-10-17T12:00:00Z',
    html_url: `https://forge.example/releases/tag/v${version}`,
    assets: assets.map((name) => ({
      name,
      size: 100,
      browser_download_url: `https://forge.example/download/v${version}/${name}`,
    })),
    ...extra,
  }
}

const ALL = (version: string) => [
  `Whisperer-${version}-mac-arm64.dmg`,
  `Whisperer-${version}-mac-x64.dmg`,
  `Whisperer-${version}-win-x64.exe`,
  `Whisperer-${version}-linux-amd64.deb`,
]

describe('compareVersions', () => {
  test('follows SemVer precedence, including numeric prerelease identifiers', () => {
    const ordered = [
      '0.1.0-preview.2',
      '0.1.0-preview.10',
      '0.1.0',
      '0.1.1-beta.1',
      '0.1.1',
      '0.2.0',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-beta',
      '1.0.0',
    ]
    for (let index = 1; index < ordered.length; index += 1) {
      expect(compareVersions(ordered[index - 1]!, ordered[index]!)).toBeLessThan(0)
      expect(compareVersions(ordered[index]!, ordered[index - 1]!)).toBeGreaterThan(0)
    }
    expect(compareVersions('1.0.0+build.1', '1.0.0')).toBe(0)
  })

  test('rejects strings that are not semantic versions', () => {
    expect(() => compareVersions('0.1', '0.1.0')).toThrow(/semantic version/)
  })
})

describe('naming', () => {
  test('parses tags and installer names that follow the scheme and nothing else', () => {
    expect(versionFromTag('v0.2.0-beta.3')).toBe('0.2.0-beta.3')
    expect(versionFromTag('0.2.0')).toBeNull()
    expect(parseAssetName('Whisperer-0.2.0-beta.3-linux-amd64.deb')).toEqual({
      version: '0.2.0-beta.3',
      os: 'linux',
      arch: 'amd64',
      ext: 'deb',
    })
    // The pre-scheme preview names carry no OS, and the x64 DMG no architecture.
    expect(parseAssetName('Whisperer-0.1.0.dmg')).toBeNull()
    expect(parseAssetName('Whisperer-0.1.0-arm64.dmg')).toBeNull()
  })

  test('matches the installer for each platform and architecture, including the Debian spelling of x64', () => {
    const subject = release('0.2.0', ALL('0.2.0'))
    expect(installerFor(subject, 'darwin', 'arm64')?.name).toBe('Whisperer-0.2.0-mac-arm64.dmg')
    expect(installerFor(subject, 'darwin', 'x64')?.name).toBe('Whisperer-0.2.0-mac-x64.dmg')
    expect(installerFor(subject, 'win32', 'x64')?.name).toBe('Whisperer-0.2.0-win-x64.exe')
    expect(installerFor(subject, 'linux', 'x64')?.name).toBe('Whisperer-0.2.0-linux-amd64.deb')
    expect(installerFor(subject, 'linux', 'arm64')).toBeNull()
    expect(installerFor(subject, 'freebsd', 'x64')).toBeNull()
  })

  test('ignores an installer whose version differs from the tag', () => {
    expect(
      installerFor(release('0.2.0', ['Whisperer-0.1.9-linux-amd64.deb']), 'linux', 'x64'),
    ).toBeNull()
  })
})

describe('newestInstallable', () => {
  test('picks the highest version with an installer here, prereleases included and drafts excluded', () => {
    const releases = [
      release('0.3.0', ALL('0.3.0'), { draft: true }),
      release('0.2.1', ['Whisperer-0.2.1-win-x64.exe']),
      release('0.2.0', ALL('0.2.0')),
      release('0.2.1-beta.2', ALL('0.2.1-beta.2')),
      release('0.1.0-preview.6', ['Whisperer-0.1.0-arm64.dmg']),
    ]
    expect(newestInstallable(releases, 'linux', 'x64')?.version).toBe('0.2.1-beta.2')
    expect(newestInstallable(releases, 'win32', 'x64')?.version).toBe('0.2.1')
    expect(newestInstallable([], 'linux', 'x64')).toBeNull()
  })
})

describe('releaseApi', () => {
  test('addresses Gitea under /api/v1 with a token header and form uploads', () => {
    const api = releaseApi(
      { provider: 'gitea', url: 'https://git.example/', owner: 'team', repo: 'Whisperer' },
      5,
    )
    expect(api.listUrl).toBe('https://git.example/api/v1/repos/team/Whisperer/releases?limit=5')
    expect(api.uploadUrl(7, 'a b.deb')).toBe(
      'https://git.example/api/v1/repos/team/Whisperer/releases/7/assets?name=a%20b.deb',
    )
    expect(api.uploadAsForm).toBe(true)
    expect(api.authorization('t')).toBe('token t')
  })

  test('addresses github.com through its API and upload hosts, and Enterprise Server under /api/v3', () => {
    const hosted = releaseApi(
      { provider: 'github', url: 'https://github.com', owner: 'team', repo: 'Whisperer' },
      5,
    )
    expect(hosted.listUrl).toBe('https://api.github.com/repos/team/Whisperer/releases?per_page=5')
    expect(hosted.uploadUrl(7, 'x.dmg')).toBe(
      'https://uploads.github.com/repos/team/Whisperer/releases/7/assets?name=x.dmg',
    )
    expect(hosted.uploadAsForm).toBe(false)
    expect(hosted.authorization('t')).toBe('Bearer t')
    const enterprise = releaseApi({
      provider: 'github',
      url: 'https://ghe.example',
      owner: 'team',
      repo: 'Whisperer',
    })
    expect(enterprise.listUrl).toBe(
      'https://ghe.example/api/v3/repos/team/Whisperer/releases?per_page=30',
    )
  })
})

describe('RELEASE_FEED', () => {
  test('points at the project repository on GitHub', () => {
    expect(RELEASE_FEED).toEqual({
      provider: 'github',
      url: 'https://github.com',
      owner: 'sharukeshalagiri',
      repo: 'Whisperer',
    })
    expect(releaseApi(RELEASE_FEED).listUrl).toBe('https://api.github.com/repos/sharukeshalagiri/Whisperer/releases?per_page=30')
  })
})
