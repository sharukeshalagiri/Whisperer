import { describe, expect, test, vi } from 'vitest';

import type { UpdateStatus } from '../../shared/contracts';
import { UpdateService, UPDATE_FIRST_CHECK_DELAY_MS } from './UpdateService';

const FEED = { provider: 'gitea', url: 'https://git.example', owner: 'team', repo: 'Whisperer' } as const;

/** Returns a release list response for the given versions, each with a Linux x64 installer. */
function feed(...versions: string[]): Response {
  return Response.json(versions.map((version) => ({
    tag_name: `v${version}`,
    name: `Whisperer ${version}`,
    draft: false,
    prerelease: version.includes('-'),
    published_at: '2026-10-17T12:00:00Z',
    html_url: `https://git.example/team/Whisperer/releases/tag/v${version}`,
    assets: [{ name: `Whisperer-${version}-linux-amd64.deb`, size: 2_000_000, browser_download_url: `https://git.example/dl/${version}.deb` }],
  })));
}

/** Builds a checker for a Linux x64 build that records every published state. */
function setup(fetch: (url: string) => Promise<Response>, currentVersion = '0.2.0') {
  const states: UpdateStatus[] = [];
  const log = vi.fn();
  const service = new UpdateService({
    feed: FEED, currentVersion, platform: 'linux', arch: 'x64',
    fetch: (url) => fetch(url), onChange: (status) => states.push(status), log,
    now: () => new Date('2026-10-17T20:00:00Z'),
  });
  return { service, states, log };
}

describe('UpdateService', () => {
  test('offers a newer prerelease with this platform\'s installer and exposes only its links', async () => {
    const urls: string[] = [];
    const { service, states } = setup(async (url) => { urls.push(url); return feed('0.2.1-beta.1', '0.2.0'); });
    expect(service.link('download')).toBeNull();
    const status = await service.check();
    expect(urls).toEqual(['https://git.example/api/v1/repos/team/Whisperer/releases?limit=30']);
    expect(states.map((state) => state.checking)).toEqual([true, false]);
    expect(status).toMatchObject({ checking: false, checkedAt: '2026-10-17T20:00:00.000Z', error: null, update: { version: '0.2.1-beta.1', prerelease: true, assetName: 'Whisperer-0.2.1-beta.1-linux-amd64.deb', bytes: 2_000_000 } });
    expect(service.link('download')).toBe('https://git.example/dl/0.2.1-beta.1.deb');
    expect(service.link('release')).toBe('https://git.example/team/Whisperer/releases/tag/v0.2.1-beta.1');
  });

  test('reports the running build as current when nothing newer exists', async () => {
    const { service } = setup(async () => feed('0.2.0', '0.1.0'));
    expect((await service.check()).update).toBeNull();
  });

  test('keeps an update already found when a later check fails, and logs the failure', async () => {
    let fail = false;
    const { service, log } = setup(async () => fail ? new Response('nope', { status: 503 }) : feed('0.3.0'));
    await service.check();
    fail = true;
    const status = await service.check();
    expect(status.update?.version).toBe('0.3.0');
    expect(status.error).toBe('The release feed answered HTTP 503.');
    expect(status.checkedAt).toBe('2026-10-17T20:00:00.000Z');
    expect(log).toHaveBeenCalledWith('Update check failed: The release feed answered HTTP 503.');
  });

  test('turns an unexpected body or a network error into an error state, never a rejection', async () => {
    expect((await setup(async () => Response.json({ message: 'not found' })).service.check()).error).toBe('The release feed returned an unexpected response.');
    expect((await setup(async () => { throw new TypeError('fetch failed'); }).service.check()).error).toBe('fetch failed');
  });

  test('rejects a release whose links are not http(s), so nothing else reaches the browser or the state event', async () => {
    const { service } = setup(async () => {
      const body = await feed('0.3.0').json();
      body[0].assets[0].browser_download_url = 'file:///etc/passwd';
      return Response.json(body);
    });
    const status = await service.check();
    expect(status.update).toBeNull();
    expect(status.error).toBe('The release feed described v0.3.0 incompletely.');
    expect(service.link('download')).toBeNull();
  });

  test('names a release with a blank title after its version', async () => {
    const { service } = setup(async () => {
      const body = await feed('0.3.0').json();
      body[0].name = '  ';
      return Response.json(body);
    });
    expect((await service.check()).update?.name).toBe('Whisperer 0.3.0');
  });

  test('stop during a scheduled check does not re-arm the schedule', async () => {
    vi.useFakeTimers();
    try {
      let release: (response: Response) => void = () => undefined;
      let calls = 0;
      const { service } = setup(() => { calls += 1; return new Promise<Response>((resolve) => { release = resolve; }); });
      service.start();
      await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_DELAY_MS);
      expect(calls).toBe(1);
      service.stop();
      release(feed('0.2.0'));
      await vi.runAllTimersAsync();
      expect(calls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('shares one request between concurrent checks', async () => {
    let calls = 0;
    const { service } = setup(async () => { calls += 1; return feed('0.2.0'); });
    await Promise.all([service.check(), service.check()]);
    expect(calls).toBe(1);
  });
});
