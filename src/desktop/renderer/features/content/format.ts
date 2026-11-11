/** Formats an optional timestamp for compact content-list metadata. */
export function formatDate(timestamp?: string): string {
  if (!timestamp) return 'No date available'
  const value = new Date(timestamp)
  return Number.isNaN(value.getTime())
    ? 'No date available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value)
}

/** Counts whitespace-delimited words in locally held text. */
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/u).length : 0
}

/** Formats a duration in milliseconds without inventing a value when none exists. */
export function formatDuration(durationMs?: number): string | undefined {
  if (durationMs === undefined || durationMs < 0) return undefined
  const seconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

/** Reads a scratchpad note id supplied through a hash or query-style route. */
export function routeNoteId(locationValue = window.location): string | undefined {
  const search = new URLSearchParams(locationValue.search)
  const direct = search.get('noteId')
  if (direct) return direct
  const hash = locationValue.hash.replace(/^#\??/u, '')
  return new URLSearchParams(hash).get('noteId') ?? undefined
}
