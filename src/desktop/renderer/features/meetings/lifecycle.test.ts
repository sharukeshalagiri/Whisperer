import { describe, expect, test } from 'vitest';

import { CaptureGenerationController, SerializedChunkQueue } from './lifecycle';

describe('CaptureGenerationController', () => {
  test('invalidates microphone acquisition after cancellation', () => {
    const controller = new CaptureGenerationController();
    const generation = controller.begin();

    controller.cancel();

    expect(controller.isCurrent(generation)).toBe(false);
  });
});

describe('SerializedChunkQueue', () => {
  test('waits for chunks in their MediaRecorder arrival order', async () => {
    const queue = new SerializedChunkQueue();
    const appended: number[] = [];
    let releaseFirst: (() => void) | undefined;

    queue.append(async () => {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      appended.push(1);
    });
    queue.append(async () => { appended.push(2); });

    await Promise.resolve();
    expect(appended).toEqual([]);
    releaseFirst?.();
    await queue.drain();

    expect(appended).toEqual([1, 2]);
  });
});
