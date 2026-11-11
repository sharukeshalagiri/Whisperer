/** Splits text into whitespace-separated words. Args: text is any dictation output. Returns: the words, none for blank text. */
function words(text: string): string[] {
  const trimmed = text.trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/u);
}

/** Counts the words in one dictation. Args: text is the final output. Returns: the whitespace-separated word count. */
export function wordCount(text: string): number {
  return words(text).length;
}

/** Lowercases a word and strips punctuation so "Shop." and "shop" compare equal. */
function normalize(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Counts raw transcript words the server changed before output: dictionary substitutions, polish and
 * snippet expansion. Each raw word is matched at most once against the output, so repeated words count
 * individually and inserted words never count. Args: rawText is the transcript before substitutions;
 * text is the final output. Returns: the number of raw words with no matching output word.
 */
export function correctedWordCount(rawText: string, text: string): number {
  const remaining = new Map<string, number>();
  for (const word of words(text)) {
    const key = normalize(word);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  let corrected = 0;
  for (const word of words(rawText)) {
    const key = normalize(word);
    const left = remaining.get(key) ?? 0;
    if (left > 0) remaining.set(key, left - 1);
    else corrected += 1;
  }
  return corrected;
}
