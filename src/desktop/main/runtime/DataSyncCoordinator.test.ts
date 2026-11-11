import { describe, expect, test } from 'vitest';

import type { ConnectionMode } from '../../shared/contracts';
import { DataSyncConflict, DataSyncCoordinator } from './DataSyncCoordinator';

type Snapshot = { from: ConnectionMode };

/** Builds a coordinator over two recorded sides. */
function setup(options: { ready?: boolean; failMerge?: ConnectionMode } = {}) {
  const calls: string[] = [];
  let gate: Promise<void> = Promise.resolve();
  let release: () => void = () => undefined;
  const coordinator = new DataSyncCoordinator<Snapshot>({
    ready: () => options.ready === false ? 'Sign in first.' : null,
    exportSnapshot: async (side) => {
      calls.push(`export:${side}`);
      await gate;
      return { from: side };
    },
    mergeSnapshot: async (side, snapshot) => {
      calls.push(`merge:${side}<-${snapshot.from}`);
      if (options.failMerge === side) throw new Error('offline');
      return side === 'device' ? 2 : 3;
    },
  });
  return { coordinator, calls, hold: () => { gate = new Promise<void>((resolve) => { release = resolve; }); }, release: () => release() };
}

describe('DataSyncCoordinator', () => {
  test('exports both sides before merging each into the other', async () => {
    const h = setup();
    await expect(h.coordinator.run()).resolves.toEqual({ changes: 5 });
    expect(h.calls).toEqual(['export:device', 'export:remote', 'merge:remote<-device', 'merge:device<-remote']);
  });

  test('refuses without both sides and touches neither', async () => {
    const h = setup({ ready: false });
    await expect(h.coordinator.run()).rejects.toBeInstanceOf(DataSyncConflict);
    expect(h.calls).toEqual([]);
  });

  test('shares one run between concurrent callers', async () => {
    const h = setup();
    h.hold();
    const first = h.coordinator.run();
    const second = h.coordinator.run();
    expect(h.coordinator.running()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.release();
    await expect(Promise.all([first, second])).resolves.toEqual([{ changes: 5 }, { changes: 5 }]);
    expect(h.calls.filter((call) => call === 'export:device')).toHaveLength(1);
    expect(h.coordinator.running()).toBe(false);
  });

  test('stops at a failed merge and allows a later retry', async () => {
    const h = setup({ failMerge: 'remote' });
    await expect(h.coordinator.run()).rejects.toThrow('offline');
    expect(h.calls).not.toContain('merge:device<-remote');
    expect(h.coordinator.running()).toBe(false);
  });
});
