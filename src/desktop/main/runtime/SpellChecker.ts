/** The session methods the spellchecker policy needs. */
export interface SpellCheckerSession {
  setSpellCheckerEnabled(enabled: boolean): void;
  setSpellCheckerLanguages(languages: string[]): void;
}

/**
 * Keep the spellchecker from contacting the network.
 *
 * On Linux, Chromium downloads Hunspell dictionaries from Google's CDN (redirector.gvt1.com) for
 * its default languages as soon as the session starts, with no user action; the renderer network
 * lock does not cover that browser-process request. Measured with Electron 44: only clearing the
 * language list stops the download. Disabling the spellchecker on the session or in a window's
 * webPreferences, or the --disable-spell-checking switch, does not. Windows and macOS use the
 * operating system's spellchecker and download nothing.
 *
 * Args:
 *   session: The default session, before any window is created.
 *   platform: process.platform.
 */
export function configureSpellChecker(session: SpellCheckerSession, platform: NodeJS.Platform): void {
  if (platform !== 'linux') return;
  session.setSpellCheckerLanguages([]);
  session.setSpellCheckerEnabled(false);
}

/** The app events the session-wide policy needs. */
export interface SessionCreatedSource {
  on(event: 'session-created', listener: (session: SpellCheckerSession) => void): unknown;
}

/**
 * Apply the spellchecker policy to every session the app creates, not just the default one.
 *
 * The API client and the update check use their own partitions; each new session starts its own
 * dictionary download on Linux. Register this before the app is ready.
 *
 * Args:
 *   app: Electron's app.
 *   platform: process.platform.
 */
export function configureSpellCheckerForAllSessions(app: SessionCreatedSource, platform: NodeJS.Platform): void {
  app.on('session-created', (session) => configureSpellChecker(session, platform));
}
