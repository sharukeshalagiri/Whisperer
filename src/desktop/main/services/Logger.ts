import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

/** Remove common token and authorization forms before anything reaches a local log. Args: value is arbitrary diagnostic text. Returns: redacted text. */
export function redact(value: string): string {
  return value
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|verifier|authorization|password)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]');
}

/** Write bounded local diagnostics without telemetry or request bodies. */
export class Logger {
  /** Args: file is the application-owned log file. Returns: a local logger. */
  constructor(private readonly file: string) { mkdirSync(dirname(file), { recursive: true, mode: 0o700 }); }

  /** Append one warning. Args: message is plain diagnostic text. Returns: nothing. */
  warn(message: string): void { this.write('warn', message); }

  /** Append one error. Args: message is plain diagnostic text. Returns: nothing. */
  error(message: string): void { this.write('error', message); }

  /** Append one safe log record, rotating at 1 MiB. Args: level is severity; message is diagnostic text. Returns: nothing, including when disk I/O fails. */
  private write(level: string, message: string): void {
    try {
      if (existsSync(this.file) && statSync(this.file).size > 1024 * 1024) renameSync(this.file, `${this.file}.previous`);
      appendFileSync(this.file, `${new Date().toISOString()} ${level} ${redact(message).replace(/[\r\n]+/g, ' ').slice(0, 1000)}\n`, { mode: 0o600 });
    } catch { /* Diagnostics cannot interrupt recording or startup. */ }
  }
}
