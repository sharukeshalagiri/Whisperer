import { describe, expect, test } from 'vitest';

import type { ConnectionMode } from '../../shared/contracts';
import { ConnectionModeCoordinator } from './ConnectionModeCoordinator';

/** Builds a coordinator whose side effects are recorded in order. */
function setup(initial: ConnectionMode = 'remote', busy: string | null = null) {
  let mode = initial;
  let busyReason = busy;
  const calls: string[] = [];
  let releaseStop: (() => void) | undefined;
  let holdStop = false;
  const coordinator = new ConnectionModeCoordinator({
    mode: () => mode,
    persist: (next) => { calls.push(`persist:${next}`); mode = next; },
    busy: () => busyReason,
    detach: () => calls.push('detach'),
    attach: (next) => calls.push(`attach:${next}`),
    startLocal: async () => { calls.push('start-local'); await new Promise<void>(() => undefined); },
    log: (message) => calls.push(`log:${message}`),
    stopLocal: async () => {
      calls.push('stop-local');
      if (holdStop) await new Promise<void>((resolve) => { releaseStop = resolve; });
    },
  });
  return {
    coordinator, calls,
    setBusy: (reason: string | null) => { busyReason = reason; },
    holdStop: () => { holdStop = true; },
    releaseStop: () => releaseStop?.(),
  };
}

describe('ConnectionModeCoordinator', () => {
  test('entering device mode drops the old scope before persisting, attaches the device scope and starts the owned server', async () => {
    const h = setup('remote');
    await h.coordinator.switchTo('device');
    expect(h.calls).toEqual(['detach', 'persist:device', 'attach:device', 'start-local']);
  });

  test('leaving device mode stops the owned server before routing to the remote server', async () => {
    const h = setup('device');
    await h.coordinator.switchTo('remote');
    expect(h.calls).toEqual(['detach', 'stop-local', 'persist:remote', 'attach:remote']);
  });

  test('is refused while dictation, a meeting or a transform is in flight', async () => {
    const h = setup('remote', 'recording');
    await expect(h.coordinator.switchTo('device')).rejects.toMatchObject({ code: 'CONFLICT', message: 'Finish the current recording, meeting or transform before switching.' });
    expect(h.calls).toEqual([]);
  });

  test('selecting the current mode changes nothing', async () => {
    const h = setup('device');
    await h.coordinator.switchTo('device');
    expect(h.calls).toEqual([]);
  });

  test('a second switch while one is in progress is refused', async () => {
    const h = setup('device');
    h.holdStop();
    const first = h.coordinator.switchTo('remote');
    await expect(h.coordinator.switchTo('remote')).rejects.toMatchObject({ code: 'CONFLICT' });
    h.releaseStop();
    await first;
    expect(h.calls.filter((call) => call === 'stop-local')).toHaveLength(1);
  });

  test('reports switching as busy so new captures cannot start mid-switch', async () => {
    const h = setup('device');
    h.holdStop();
    const pending = h.coordinator.switchTo('remote');
    expect(h.coordinator.switching()).toBe(true);
    h.releaseStop();
    await pending;
    expect(h.coordinator.switching()).toBe(false);
  });

  test('returns without waiting for the owned server to finish starting', async () => {
    const h = setup('remote');
    await expect(h.coordinator.switchTo('device')).resolves.toBeUndefined();
    expect(h.calls.at(-1)).toBe('start-local');
  });
});
