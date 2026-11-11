import { describe, expect, test } from 'vitest'

import { booksWritten, formatDuration, heatMapWindow, isoDate, monthDelta, rankWordsPerMinute } from './insights-model'

describe('heatMapWindow', () => {
  test('the current page ends today and opens on a Sunday sixteen weeks back', () => {
    const today = new Date(2026, 9, 14) // Wednesday 2026-10-14
    const window = heatMapWindow(today, 0)
    expect(isoDate(window.end)).toBe('2026-10-14')
    expect(window.start.getDay()).toBe(0)
    expect(isoDate(window.start)).toBe('2026-06-28')
  })

  test('earlier pages are whole weeks ending the Saturday before the next page', () => {
    const previous = heatMapWindow(new Date(2026, 9, 14), 1)
    expect(isoDate(previous.start)).toBe('2026-03-08')
    expect(isoDate(previous.end)).toBe('2026-06-27')
    expect(previous.end.getDay()).toBe(6)
  })
})

describe('rankWordsPerMinute', () => {
  test('fills the gauge against fast speech and compares with typing', () => {
    expect(rankWordsPerMinute(0)).toEqual({ fill: 0, caption: 'No rate yet' })
    expect(rankWordsPerMinute(100)).toEqual({ fill: 0.5, caption: '2.5× typing' })
    expect(rankWordsPerMinute(400).fill).toBe(1)
    expect(rankWordsPerMinute(400).caption).toBe('10× typing')
  })
})

describe('booksWritten', () => {
  test('counts complete books and shows progress before the first', () => {
    expect(booksWritten(45_000)).toBe('50% of the way to your first book.')
    expect(booksWritten(90_000)).toBe("You've written 1 complete book!")
    expect(booksWritten(1_081_509)).toBe("You've written 12 complete books!")
  })
})

describe('monthDelta', () => {
  test('compares with last month and falls back to a plain count', () => {
    expect(monthDelta({ wordsThisMonth: 985, wordsLastMonth: 1000 })).toEqual({ direction: 'down', label: '1.5% this month' })
    expect(monthDelta({ wordsThisMonth: 1200, wordsLastMonth: 1000 })).toEqual({ direction: 'up', label: '20% this month' })
    expect(monthDelta({ wordsThisMonth: 50, wordsLastMonth: 0 })).toEqual({ direction: 'flat', label: '50 this month' })
  })
})

describe('formatDuration', () => {
  test('shows hours only once they are reached', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(12 * 60_000)).toBe('12m')
    expect(formatDuration(192 * 60_000)).toBe('3h 12m')
  })
})
