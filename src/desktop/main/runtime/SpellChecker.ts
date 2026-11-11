/** The session methods the spellchecker policy needs. */
export interface SpellCheckerSession {
  setSpellCheckerEnabled(enabled: boolean): void;
}

/**
 * Keep the spellchecker from contacting the network.
 *
 * On Linux, Chromium downloads Hunspell dictionaries from Google's CDN the first time an editable
 * field appears, with no user action; the renderer network lock does not cover that browser-process
 * request. Windows and macOS use the operating system's spellchecker and download nothing.
 *
 * Args:
 *   session: The default session.
 *   platform: process.platform.
 */
export function configureSpellChecker(session: SpellCheckerSession, platform: NodeJS.Platform): void {
  if (platform === 'linux') session.setSpellCheckerEnabled(false);
}
