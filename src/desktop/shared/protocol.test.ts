import { describe, expect, test } from 'vitest';

import { CHANNELS, IPC_RUNTIME_SPECS } from './protocol';

describe('IPC contract', () => {
  test('View changes may answer with the applied-transform view instead of a proposal', () => {
    const spec = IPC_RUNTIME_SPECS[CHANNELS.transformations.view];
    expect(spec.response.safeParse({ ok: true, data: null }).success).toBe(true);
  });
});
