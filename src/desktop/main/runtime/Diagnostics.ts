import { redact } from '../services/Logger';

/** Facts a diagnostics export may contain. It never includes dictation, notes, meetings or snippets. */
export interface DiagnosticsInput {
  exportedAt: string;
  appVersion: string;
  platform: string;
  arch: string;
  osRelease: string;
  electron: string;
  connectionMode: string;
  capabilities: unknown;
  /** Contents of main.log, which is already redacted when written. */
  log: string;
}

/** Most of the log a support request needs, without making the file unwieldy. */
const MAX_LOG_LINES = 2000;

/**
 * Build the JSON a user can attach to a bug report.
 *
 * It holds version and platform facts, capabilities and the tail of the local log, redacted
 * again. User content (dictation history, notes, meetings, snippets) is never included.
 *
 * Args:
 *   input: Collected facts and the raw log text.
 * Returns:
 *   Pretty-printed JSON.
 */
export function buildDiagnostics(input: DiagnosticsInput): string {
  const lines = input.log.split(/\r?\n/u).filter((line) => line.length > 0);
  const { log: _log, ...facts } = input;
  return JSON.stringify({ ...facts, log: lines.slice(-MAX_LOG_LINES).map((line) => redact(line)) }, null, 2);
}
