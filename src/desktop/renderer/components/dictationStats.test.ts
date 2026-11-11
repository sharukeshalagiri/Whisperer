import { describe, expect, it } from 'vitest'

import { dictationStatsFromMetrics } from './dictationStats'

/** Pins account-authoritative presentation rather than local-history derivation. */
describe('dictationStatsFromMetrics', () => {
  it('preserves backend totals and WPM exactly', () => {
    expect(dictationStatsFromMetrics({ totalWords: 1200, wordsPerMinute: 143, weekStreak: 5 })).toEqual({
      totalWords: 1200,
      wordsPerMinute: 143,
      weekStreak: 5,
    })
  })

  it('preserves a legitimate empty account response', () => {
    expect(dictationStatsFromMetrics({ totalWords: 0, wordsPerMinute: 0, weekStreak: 0 })).toEqual({
      totalWords: 0,
      wordsPerMinute: 0,
      weekStreak: 0,
    })
  })
})
