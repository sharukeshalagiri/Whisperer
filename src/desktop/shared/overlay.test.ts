import { describe, expect, test } from 'vitest'

import type { RecordingState } from './contracts'
import { isVerticalDock, overlayHoverActions, overlayPillSize, overlayPresentation, overlayWindowLayout, overlayWindowSize, waveformHeights } from './overlay'

const recording = (status: RecordingState['status'], mode?: RecordingState['mode']): RecordingState => ({
  status, mode, capturePhase: 'idle', startedAt: null, error: null,
})

describe('overlay presentation', () => {
  test('uses real state, not internal phase copy, for compact pill variants', () => {
    expect(overlayPresentation(recording('idle'), null, false)).toBe('resting')
    expect(overlayPresentation(recording('idle'), null, true)).toBe('ready')
    expect(overlayPresentation(recording('recording'), null, false)).toBe('handsfree')
    expect(overlayPresentation(recording('recording', 'push-to-talk'), null, false)).toBe('push-to-talk')
    expect(overlayPresentation(recording('processing'), null, false)).toBe('processing')
    expect(overlayPresentation(recording('error'), null, false)).toBe('error')
    expect(overlayPresentation(recording('idle'), { id: 'm', title: 'Meeting', status: 'recording', startedAt: '2026-10-13T00:00:00.000Z', error: null }, false)).toBe('meeting')
  })

  test('sizes the window to the pill plus its reference hit padding only', () => {
    expect(overlayWindowSize('resting')).toEqual({ width: 60, height: 20 })
    expect(overlayWindowSize('handsfree')).toEqual({ width: 123, height: 42 })
  })
})

describe('waveformHeights', () => {
  test('keeps silence at the minimum and shapes real level with a center bulge', () => {
    expect(waveformHeights(0)).toEqual(Array(10).fill(2))
    const speech = waveformHeights(0.1)
    expect(speech[4]).toBeGreaterThan(speech[0]!)
    expect(speech[4]).toBe(speech[5])
    expect(Math.max(...waveformHeights(1))).toBeLessThanOrEqual(15)
  })

  test('keeps the center bulge when loud speech reaches the peak clamp', () => {
    const loud = waveformHeights(1)
    // Ten bars put the two center bars 0.5 from the middle, so their bulge is just below one.
    expect(loud[4]).toBeCloseTo(15 * (1 - 0.25 / 48), 6)
    expect(Math.max(...loud)).toBeLessThanOrEqual(15)
    expect(loud[4]).toBeGreaterThan(loud[0]!)
    expect(loud).toEqual([...loud].reverse())
    expect(Math.min(...loud)).toBeGreaterThanOrEqual(2)
  })

  test('shows the transforming pill only while idle, so dictation keeps priority', () => {
    const applying = { phase: 'applying' as const, name: 'Polish' }
    expect(overlayPresentation(recording('idle'), null, false, applying)).toBe('transforming')
    expect(overlayPresentation(recording('recording'), null, false, applying)).toBe('handsfree')
    expect(overlayPresentation(recording('idle'), null, false, { phase: 'failed', name: 'Polish', message: 'x' })).toBe('resting')
  })

  test('widens the pill for the cancel button', () => {
    expect(overlayPillSize('push-to-talk').width).toBeGreaterThan(73)
    expect(overlayPillSize('processing').width).toBeGreaterThan(98)
  })
})

describe('docked bar layout', () => {
  test('turns the pill 90 degrees on a side edge', () => {
    expect(isVerticalDock('bottom')).toBe(false)
    expect(overlayPillSize('handsfree', { edge: 'left' })).toEqual({ width: 30, height: 102.5 })
    expect(overlayPillSize('ready', { edge: 'right' })).toEqual({ width: 30, height: 50 })
  })

  test('offers Notetaker, then the first transform and scratchpad when available', () => {
    expect(overlayHoverActions()).toEqual(['notetaker'])
    expect(overlayHoverActions({ quickTransform: true, scratchpad: true })).toEqual(['notetaker', 'transform', 'scratchpad'])
  })

  test('stacks hover actions along the edge and reserves tooltip room toward the interior', () => {
    const bottom = overlayWindowLayout('ready', { actions: 2 })
    expect(bottom.stack).toEqual({ width: 50 + 2 * 34 + 20, height: 42 })
    expect(bottom.window.height).toBeGreaterThan(bottom.stack.height)
    const side = overlayWindowLayout('ready', { edge: 'right', actions: 2 })
    expect(side.stack).toEqual({ width: 42, height: 50 + 2 * 34 + 20 })
    expect(side.window).toEqual({ width: side.stack.width + 220, height: side.stack.height })
  })

  test('shows actions and tooltip room only on the hovered idle pill', () => {
    expect(overlayWindowLayout('handsfree', { edge: 'left', actions: 2 }).window).toEqual({ width: 42, height: 123 })
    expect(overlayWindowSize('resting', { actions: 2 })).toEqual({ width: 60, height: 20 })
  })
})
