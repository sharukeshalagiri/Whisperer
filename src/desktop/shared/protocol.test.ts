import { describe, expect, test } from 'vitest';

import { CHANNELS, IPC_RUNTIME_SPECS } from './protocol';

describe('IPC contract', () => {
  test('View changes may answer with the applied-transform view instead of a proposal', () => {
    const spec = IPC_RUNTIME_SPECS[CHANNELS.transformations.view];
    expect(spec.response.safeParse({ ok: true, data: null }).success).toBe(true);
  });

  test('rejects malformed and over-reaching payloads before a handler runs', () => {
    const update = IPC_RUNTIME_SPECS[CHANNELS.settings.update].request;
    expect(update.safeParse({ autoPaste: true }).success).toBe(true);
    expect(update.safeParse({ autoPaste: 'yes' }).success).toBe(false);
    expect(update.safeParse({ autoPaste: true, apiHost: 'https://evil.example' }).success).toBe(false);
    expect(update.safeParse({ __proto__: { polluted: true }, accessToken: 'x' }).success).toBe(false);

    const submit = IPC_RUNTIME_SPECS[CHANNELS.recording.submit].request;
    expect(submit.safeParse({ audio: 'not bytes', durationMs: 1, contentType: 'audio/wav', filename: 'a.wav' }).success).toBe(false);
    expect(submit.safeParse({ audio: new Uint8Array(1), durationMs: -1, contentType: 'audio/wav', filename: 'a.wav' }).success).toBe(false);

    const erase = IPC_RUNTIME_SPECS[CHANNELS.localData.erase].request;
    expect(erase.safeParse({ everything: true }).success).toBe(false);
  });
});
