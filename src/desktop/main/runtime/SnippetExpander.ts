/** A locally saved phrase that expands when spoken during dictation. */
export interface SpokenSnippet {
  id: string;
  shortcut: string;
  text: string;
}

/** Expands literal spoken triggers once, without recursively interpreting inserted text.
 * Args: text is the final transcript; snippets are the current account's private expansions.
 * Returns: final text and per-snippet usage counts.
 * Raises: Error when expansion would exceed the clipboard text safety bound.
 */
export function expandSpokenSnippets(text: string, snippets: readonly SpokenSnippet[]): { text: string; uses: Map<string, number> } {
  const normalized = (value: string): string => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const byTrigger = new Map<string, SpokenSnippet>();
  for (const snippet of snippets) {
    const trigger = normalized(snippet.shortcut);
    if (trigger && !byTrigger.has(trigger)) byTrigger.set(trigger, snippet);
  }
  if (!byTrigger.size) return { text, uses: new Map() };
  const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const triggers = [...byTrigger.keys()].sort((left, right) => right.length - left.length);
  const pattern = triggers.map((trigger) => trigger.split(' ').map(escaped).join('\\s+')).join('|');
  const expression = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, 'giu');
  const uses = new Map<string, number>();
  const expanded = text.replace(expression, (match) => {
    const snippet = byTrigger.get(normalized(match));
    if (!snippet) return match;
    uses.set(snippet.id, (uses.get(snippet.id) ?? 0) + 1);
    return snippet.text;
  });
  if (expanded.length > 1000000) throw new Error('The expanded dictation is too large to copy. Shorten the snippet and retry.');
  return { text: expanded, uses };
}
