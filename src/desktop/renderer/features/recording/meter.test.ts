import { describe, expect, test } from 'vitest'
import { AudioMeterEnvelope } from './meter'

// Replacing PCM measurement with a fixed or synthetic waveform must break these contracts.
describe('AudioMeterEnvelope', () => {
  test('keeps silence flat and reacts to actual PCM amplitude', () => {
    const meter = new AudioMeterEnvelope()
    expect(meter.measure(new Float32Array(4096))).toBe(0)
    meter.measure(new Float32Array(4096).fill(0.001))
    const quiet = meter.measure(new Float32Array(4096).fill(0.002))
    const speech = meter.measure(new Float32Array(4096).fill(0.15))
    expect(quiet).toBeGreaterThan(0)
    expect(speech).toBeGreaterThan(quiet)
    expect(speech).toBeLessThanOrEqual(1)
  })

  test('decays after speech and resets between recordings', () => {
    const meter = new AudioMeterEnvelope()
    meter.measure(new Float32Array(4096).fill(0.001))
    const speech = meter.measure(new Float32Array(4096).fill(0.2))
    const decay = meter.measure(new Float32Array(4096))
    expect(decay).toBeLessThan(speech)
    expect(decay).toBeGreaterThan(0)
    for (let index = 0; index < 30; index += 1) meter.measure(new Float32Array(4096))
    expect(meter.measure(new Float32Array(4096))).toBe(0)
    meter.measure(new Float32Array([0.4]))
    meter.reset()
    expect(meter.measure(new Float32Array())).toBe(0)
  })

  test('contains clipped and non-finite input without fabricating activity', () => {
    const meter = new AudioMeterEnvelope()
    expect(meter.measure(new Float32Array([NaN, Infinity, -Infinity]))).toBe(0)
    expect(meter.measure(new Float32Array([2, -2]))).toBeLessThanOrEqual(1)
  })
})
