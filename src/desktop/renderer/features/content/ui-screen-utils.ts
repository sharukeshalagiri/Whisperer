import type { DictionaryEntry, HistoryEntry, Meeting, Snippet } from './api'
import { formatDate } from './format'

/** Filters personal dictionary entries by either persisted text field. */
export function filterDictionaryEntries(entries: DictionaryEntry[], query: string): DictionaryEntry[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return entries
  return entries.filter(({ phrase, replacement }) =>
    `${phrase} ${replacement}`.toLocaleLowerCase().includes(normalized),
  )
}

/** Returns snippets whose trigger or body matches a case-insensitive query. */
export function filterSnippets(snippets: Snippet[], query: string): Snippet[] {
  const normalized = query.trim().toLocaleLowerCase()
  return normalized
    ? snippets.filter((snippet) => `${snippet.shortcut} ${snippet.text}`.toLocaleLowerCase().includes(normalized))
    : snippets
}

/** Filters locally persisted meeting metadata by its real title and date. */
export function filterMeetings(meetings: Meeting[], query: string): Meeting[] {
  const normalized = query.trim().toLocaleLowerCase()
  return normalized
    ? meetings.filter((meeting) => `${meeting.title} ${formatDate(meeting.startedAt)}`.toLocaleLowerCase().includes(normalized))
    : meetings
}

/**
 * Names a meeting's local calendar date relative to a supplied local day.
 *
 * Args:
 *   timestamp: The persisted meeting start instant.
 *   now: The local calendar date used to determine today and yesterday.
 * Returns:
 *   Today, Yesterday, a formatted older date, or the unreadable-date label.
 */
export function meetingDayLabel(timestamp: string, now = new Date()): string {
  const meeting = new Date(timestamp)
  if (Number.isNaN(meeting.getTime())) return formatDate(timestamp)
  const isSameDay = (left: Date, right: Date): boolean => left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (isSameDay(meeting, now)) return 'Today'
  if (isSameDay(meeting, yesterday)) return 'Yesterday'
  return formatDate(timestamp)
}

/** Matches raw or final transcript text and a known target application. */
export function matchesHistoryEntry(entry: HistoryEntry, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  return !normalized || `${entry.text} ${entry.rawText} ${entry.appName ?? ''}`.toLocaleLowerCase().includes(normalized)
}

/**
 * Groups history records by their local calendar day, preserving input order.
 *
 * Args:
 *   entries: History records, normally newest first.
 *   now: The moment that decides which day is today.
 * Returns:
 *   Day labels paired with their records. Today and yesterday are named, older
 *   days use the medium local date, and unreadable timestamps share one group.
 */
export function groupHistoryByDate(entries: readonly HistoryEntry[], now = new Date()): Array<[string, HistoryEntry[]]> {
  const groups = new Map<string, HistoryEntry[]>()
  for (const entry of entries) {
    const date = historyDayLabel(entry.createdAt, now)
    groups.set(date, [...(groups.get(date) ?? []), entry])
  }
  return [...groups]
}

/** Names a local calendar day relative to now, falling back to the medium date. */
function historyDayLabel(timestamp: string, now: Date): string {
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return formatDate(timestamp)
  const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  // Round so a daylight saving change cannot turn yesterday into a 23 or 25 hour fraction.
  const daysAgo = Math.round((startOfDay(now) - startOfDay(value)) / 86_400_000)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return formatDate(timestamp)
}

/**
 * Formats a dictation time as a compact 12 hour clock, such as 4:50pm.
 *
 * Args:
 *   timestamp: The persisted creation time.
 * Returns:
 *   The local time, or an empty string when the timestamp cannot be read.
 */
export function formatHistoryTime(timestamp: string): string {
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return ''
  const hours = value.getHours()
  return `${hours % 12 || 12}:${String(value.getMinutes()).padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`
}
