import { describe, expect, test, vi } from 'vitest';

import { configureSpellChecker } from './SpellChecker';

describe('configureSpellChecker', () => {
  test('clears the dictionary languages on Linux, which is what stops the download', () => {
    const session = { setSpellCheckerEnabled: vi.fn(), setSpellCheckerLanguages: vi.fn() };
    configureSpellChecker(session, 'linux');
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith([]);
    expect(session.setSpellCheckerEnabled).toHaveBeenCalledWith(false);
  });

  test('keeps the operating system spellchecker on Windows and macOS', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      const session = { setSpellCheckerEnabled: vi.fn(), setSpellCheckerLanguages: vi.fn() };
      configureSpellChecker(session, platform);
      expect(session.setSpellCheckerLanguages).not.toHaveBeenCalled();
      expect(session.setSpellCheckerEnabled).not.toHaveBeenCalled();
    }
  });
});
