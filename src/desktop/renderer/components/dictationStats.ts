import type { Metrics } from '../../shared/contracts'

/** Values rendered from the signed-in account metrics response. */
export interface DictationStats {
  /** Words dictated across the signed-in account. */
  totalWords: number
  /** Rounded words per recorded minute across the signed-in account. */
  wordsPerMinute: number
  /** Consecutive active weeks reported by the server. */
  weekStreak: number
}

/**
 * Selects the account values used in compact Dictation and Insights metric displays.
 *
 * Args:
 *   metrics: Server-authoritative account metrics.
 *
 * Returns:
 *   Values which exactly represent the server response without local derivation.
 */
export function dictationStatsFromMetrics(metrics: Pick<Metrics, 'totalWords' | 'wordsPerMinute' | 'weekStreak'>): DictationStats {
  return {
    totalWords: metrics.totalWords,
    wordsPerMinute: metrics.wordsPerMinute,
    weekStreak: metrics.weekStreak,
  }
}
