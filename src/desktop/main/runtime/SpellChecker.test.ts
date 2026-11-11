import { describe, expect, test, vi } from 'vitest';

import { configureSpellChecker } from './SpellChecker';

describe('configureSpellChecker', () => {
  test('turns the spellchecker off on Linux, where it would download dictionaries', () => {
    const session = { setSpellCheckerEnabled: vi.fn() };
    configureSpellChecker(session, 'linux');
    expect(session.setSpellCheckerEnabled).toHaveBeenCalledWith(false);
  });

  test('keeps the operating system spellchecker on Windows and macOS', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      const session = { setSpellCheckerEnabled: vi.fn() };
      configureSpellChecker(session, platform);
      expect(session.setSpellCheckerEnabled).not.toHaveBeenCalled();
    }
  });
});
