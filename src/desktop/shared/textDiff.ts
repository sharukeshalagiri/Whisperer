/** One run of unchanged, removed or inserted text in a before/after comparison. */
export interface DiffSegment {
  kind: 'same' | 'removed' | 'added'
  text: string
}

/** Above this many token pairs the comparison falls back to whole-text replacement to stay responsive. */
const MAX_DIFF_CELLS = 250_000

/** Splits text into words and the whitespace between them so joining tokens reproduces it exactly. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/gu) ?? []
}

/** Appends a token, merging it with the previous segment of the same kind. */
function push(segments: DiffSegment[], kind: DiffSegment['kind'], text: string): void {
  const last = segments.at(-1)
  if (last?.kind === kind) last.text += text
  else segments.push({ kind, text })
}

/**
 * Compares two texts word by word with a longest-common-subsequence table.
 *
 * Args:
 *   before: Original text.
 *   after: Replacement text.
 * Returns:
 *   Ordered segments whose same+removed text is `before` and same+added text is `after`.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before)
  const b = tokenize(after)
  if (a.length * b.length > MAX_DIFF_CELLS) {
    return [...(before ? [{ kind: 'removed' as const, text: before }] : []), ...(after ? [{ kind: 'added' as const, text: after }] : [])]
  }
  // lengths[i][j] is the LCS length of a[i..] and b[j..].
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] = a[i] === b[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const segments: DiffSegment[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push(segments, 'same', a[i]!); i += 1; j += 1 }
    else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) { push(segments, 'removed', a[i]!); i += 1 }
    else { push(segments, 'added', b[j]!); j += 1 }
  }
  while (i < a.length) { push(segments, 'removed', a[i]!); i += 1 }
  while (j < b.length) { push(segments, 'added', b[j]!); j += 1 }
  return segments
}
