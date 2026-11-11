import type { DailyMetric, Metrics } from '../../../shared/contracts'

/** Average length of a novel, used to turn lifetime words into a familiar comparison. */
const WORDS_PER_BOOK = 90_000
/** Typical conversational speech rate; typists manage far less. */
const TYPING_WPM = 40

/** How many weeks of daily activity one heat-map page shows. */
export const HEAT_MAP_WEEKS = 16

/** Formats a date as the YYYY-MM-DD the metrics API expects. Args: date is any local time. Returns: the local calendar date. */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Shifts a date by whole days without changing its local clock time. Args: date is the origin; days may be negative. Returns: a new date. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** One page of the activity heat map: a whole number of weeks ending on a Saturday, or today for the current page. */
export interface HeatMapWindow {
  /** Local Sunday that opens the page. */
  start: Date
  /** Local day that closes the page. */
  end: Date
}

/**
 * Computes the heat-map page that ends `pagesBack` pages before today. Args: today is the local date;
 * pagesBack is zero for the current page. Returns: the inclusive window, aligned to Sunday-based weeks.
 */
export function heatMapWindow(today: Date, pagesBack: number): HeatMapWindow {
  const thisSunday = addDays(today, -today.getDay())
  const start = addDays(thisSunday, -7 * (HEAT_MAP_WEEKS - 1 + HEAT_MAP_WEEKS * pagesBack))
  const end = pagesBack === 0 ? today : addDays(start, 7 * HEAT_MAP_WEEKS - 1)
  return { start, end }
}

/** The relative position of a words-per-minute rate against typing and speaking rates. */
export interface WpmRank {
  /** Fraction of the gauge to fill, from 0 to 1. */
  fill: number
  /** Short caption shown inside the gauge. */
  caption: string
}

/**
 * Ranks a dictation rate on a gauge that runs from a typing pace to fast speech. Args: wordsPerMinute is
 * the account's recent rate. Returns: the gauge fill and a caption such as "3× typing".
 */
export function rankWordsPerMinute(wordsPerMinute: number): WpmRank {
  const fill = Math.min(1, Math.max(0, wordsPerMinute / 200))
  const multiple = wordsPerMinute / TYPING_WPM
  const caption = wordsPerMinute === 0 ? 'No rate yet' : `${multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}× typing`
  return { fill, caption }
}

/** Describes lifetime words in books. Args: totalWords is the account total. Returns: a sentence, or an encouragement before the first book. */
export function booksWritten(totalWords: number): string {
  const books = Math.floor(totalWords / WORDS_PER_BOOK)
  if (books === 0) return `${Math.round((totalWords / WORDS_PER_BOOK) * 100)}% of the way to your first book.`
  return `You've written ${books} complete ${books === 1 ? 'book' : 'books'}!`
}

/** The change in monthly output against the previous month. */
export interface MonthDelta {
  direction: 'up' | 'down' | 'flat'
  label: string
}

/**
 * Compares this month's words with last month's. Args: metrics carries both monthly totals. Returns: the
 * direction and a label such as "12% this month"; "flat" when last month had no words.
 */
export function monthDelta(metrics: Pick<Metrics, 'wordsThisMonth' | 'wordsLastMonth'>): MonthDelta {
  if (metrics.wordsLastMonth === 0) return { direction: 'flat', label: `${metrics.wordsThisMonth.toLocaleString()} this month` }
  const change = ((metrics.wordsThisMonth - metrics.wordsLastMonth) / metrics.wordsLastMonth) * 100
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  // One decimal keeps small monthly moves visible without false precision on large ones.
  const magnitude = Math.abs(change)
  return { direction, label: `${magnitude >= 10 ? Math.round(magnitude) : magnitude.toFixed(1)}% this month` }
}

/** Formats a millisecond duration as hours and minutes. Args: durationMs is any span. Returns: "3h 12m", "12m" or "0m". */
export function formatDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

/** Sums the words across a daily series. Args: days is any range. Returns: the total. */
export function totalWords(days: readonly DailyMetric[]): number {
  return days.reduce((sum, day) => sum + day.words, 0)
}
