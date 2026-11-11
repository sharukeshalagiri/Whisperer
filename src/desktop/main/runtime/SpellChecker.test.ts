import { describe, expect, test, vi } from 'vitest';

import { configureSpellChecker, configureSpellCheckerForAllSessions } from './SpellChecker';

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

  test('covers every session the app creates, including dedicated partitions', () => {
    const listeners: Array<(session: { setSpellCheckerEnabled: () => void; setSpellCheckerLanguages: (languages: string[]) => void }) => void> = [];
    const app = { on: (_event: 'session-created', listener: (typeof listeners)[number]) => { listeners.push(listener); } };
    configureSpellCheckerForAllSessions(app, 'linux');
    const partition = { setSpellCheckerEnabled: vi.fn(), setSpellCheckerLanguages: vi.fn() };
    for (const listener of listeners) listener(partition);
    expect(partition.setSpellCheckerLanguages).toHaveBeenCalledWith([]);
  });
});
