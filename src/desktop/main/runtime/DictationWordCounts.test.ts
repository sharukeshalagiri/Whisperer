import { describe, expect, test } from 'vitest';

import { correctedWordCount, wordCount } from './DictationWordCounts';

describe('wordCount', () => {
  test('counts whitespace-separated words and treats blank text as empty', () => {
    expect(wordCount('  hello   world \n again ')).toBe(3);
    expect(wordCount('   ')).toBe(0);
  });
});

describe('correctedWordCount', () => {
  test('is zero when the output matches the raw transcript', () => {
    expect(correctedWordCount('hello world', 'hello world')).toBe(0);
  });

  test('counts raw words that are replaced, dropped or reordered, ignoring case and punctuation', () => {
    expect(correctedWordCount('i went too the shop', 'I went to the shop.')).toBe(1);
    expect(correctedWordCount('um so the the plan', 'So the plan')).toBe(2);
    expect(correctedWordCount('', 'Inserted words only')).toBe(0);
  });
});
