import { describe, expect, test } from 'vitest';

import { signInCode } from './SignInCode';

describe('signInCode', () => {
  test('matches the API derivation (vector pinned in test_auth_resource_smoke.py)', () => {
    expect(signInCode('3f2b8c1e-5d4a-4e6b-9c7d-0a1b2c3d4e5f')).toBe('YC5R-3KNG');
  });

  test('always yields two groups of four base32 characters', () => {
    for (const code of ['', 'a', crypto.randomUUID(), crypto.randomUUID()]) {
      expect(signInCode(code)).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    }
  });
});
