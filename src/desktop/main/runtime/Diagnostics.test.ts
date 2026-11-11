import { describe, expect, test } from 'vitest';

import { buildDiagnostics } from './Diagnostics';

const base = {
  exportedAt: '2026-11-11T00:00:00.000Z', appVersion: '0.2.0-beta.2', platform: 'linux', arch: 'x64', osRelease: '6.1',
  electron: '44.10.2', connectionMode: 'device', capabilities: { insertion: true },
};

describe('buildDiagnostics', () => {
  test('carries version facts and the redacted log tail only', () => {
    const json = JSON.parse(buildDiagnostics({ ...base, log: 'warn one\nAuthorization: Bearer abc.def\n' }));
    expect(json.appVersion).toBe('0.2.0-beta.2');
    expect(json.log[0]).toBe('warn one');
    expect(json.log[1]).not.toContain('abc.def');
    expect(Object.keys(json)).not.toContain('localData');
  });

  test('keeps only the most recent log lines', () => {
    const log = Array.from({ length: 2500 }, (_, index) => `line ${index}`).join('\n');
    const json = JSON.parse(buildDiagnostics({ ...base, log }));
    expect(json.log).toHaveLength(2000);
    expect(json.log.at(-1)).toBe('line 2499');
  });
});
