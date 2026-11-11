import { describe, expect, test } from 'vitest';

import { expandSpokenSnippets } from './SnippetExpander';

describe('expandSpokenSnippets', () => {
  test('expands whole spoken triggers case-insensitively and counts uses', () => {
    const result = expandSpokenSnippets('Send my  LinkedIn and my linkedin.', [{ id: 'a', shortcut: 'my linkedin', text: 'https://example.test/me' }]);
    expect(result.text).toBe('Send https://example.test/me and https://example.test/me.');
    expect(result.uses.get('a')).toBe(2);
  });

  test('prefers the longest trigger and never expands inserted text again', () => {
    const result = expandSpokenSnippets('intro email', [
      { id: 'short', shortcut: 'intro', text: 'intro email' },
      { id: 'long', shortcut: 'intro email', text: 'Hello, intro' },
    ]);
    expect(result.text).toBe('Hello, intro');
    expect([...result.uses]).toEqual([['long', 1]]);
  });

  test('does not expand triggers inside other words', () => {
    expect(expandSpokenSnippets('cartography', [{ id: 'a', shortcut: 'cart', text: 'x' }]).text).toBe('cartography');
  });
});
