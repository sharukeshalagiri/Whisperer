import { describe, expect, test } from 'vitest';

import { RecordingCoordinator } from './RecordingCoordinator';

describe('RecordingCoordinator', () => {
  test('does not announce a start after its deferred target lookup is cancelled', async () => {
    const coordinator = new RecordingCoordinator();
    let finish: ((value: string) => void) | undefined;
    const commands: string[] = [];
    const pending = coordinator.prepareStart(() => new Promise<string>((resolve) => { finish = resolve; }), () => { commands.push('start'); });
    coordinator.cancel();
    finish?.('old target');
    await expect(pending).rejects.toThrow('Recording start cancelled');
    expect(commands).toEqual([]);
    expect(coordinator.phase).toBe('idle');
  });

  test('reserves one start before awaiting target capture', async () => {
    const coordinator = new RecordingCoordinator();
    let finish: ((value: string) => void) | undefined;
    const commands: string[] = [];
    const first = coordinator.prepareStart(() => new Promise<string>((resolve) => { finish = resolve; }), () => { commands.push('start'); });
    await expect(coordinator.prepareStart(async () => 'second target', () => { commands.push('start'); })).rejects.toThrow('A recording is already starting');
    finish?.('first target');
    await first;
    expect(commands).toEqual(['start']);
  });

  test('aborts the request and rejects a late transcription result after cancellation', async () => {
    let resolveTranscription: ((value: { text: string }) => void) | undefined;
    const coordinator = new RecordingCoordinator();
    const pending = coordinator.submit(async (signal) => {
      expect(signal.aborted).toBe(false);
      return new Promise((resolve) => {
        resolveTranscription = resolve;
      });
    });

    coordinator.cancel();
    resolveTranscription?.({ text: 'late private text' });

    await expect(pending).rejects.toThrow('Transcription cancelled');
    expect(coordinator.phase).toBe('idle');
  });

  test('permits only one transcription request at a time', async () => {
    const coordinator = new RecordingCoordinator();
    let finish: ((value: { text: string }) => void) | undefined;
    const pending = coordinator.submit(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    await expect(coordinator.submit(async () => ({ text: 'second' }))).rejects.toThrow(
      'A transcription is already in progress',
    );
    finish?.({ text: 'first' });
    await expect(pending).resolves.toEqual({ text: 'first' });
  });
});
