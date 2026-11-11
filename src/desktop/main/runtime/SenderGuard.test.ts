import { describe, expect, test } from 'vitest';

import { SenderGuard } from './SenderGuard';

describe('SenderGuard', () => {
  test('accepts only an owned window main frame', () => {
    const ownedMainFrame = { id: 1 };
    const ownedContents = { mainFrame: ownedMainFrame };
    const guard = new SenderGuard(() => [ownedContents]);

    expect(guard.allows({ sender: ownedContents, senderFrame: ownedMainFrame })).toBe(true);
    expect(guard.allows({ sender: ownedContents, senderFrame: { id: 2 } })).toBe(false);
    expect(guard.allows({ sender: { mainFrame: ownedMainFrame }, senderFrame: ownedMainFrame })).toBe(false);
  });
});
