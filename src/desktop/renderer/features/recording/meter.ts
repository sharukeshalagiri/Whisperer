/** Measures a speech envelope from captured PCM, with fast attack and a short release. */
export class AudioMeterEnvelope {
  private level = 0
  private noiseFloorDb = 0

  /** Returns a bounded RMS envelope for these mono samples; silence never creates motion. */
  measure(frames: Float32Array): number {
    let squares = 0
    for (const sample of frames) {
      if (Number.isFinite(sample)) squares += Math.min(1, sample * sample)
    }
    const rms = frames.length ? Math.sqrt(squares / frames.length) : 0
    const db = 20 * Math.log10(rms + 1e-10)
    // Learn the lowest observed noise floor, bounded at -60 dB, across a 20 dB speech range.
    this.noiseFloorDb = Math.max(-60, Math.min(this.noiseFloorDb, db))
    const target = Math.min(1, Math.max(0, (db - this.noiseFloorDb) / 20))
    const smoothing = target > this.level ? 0.75 : 0.3
    this.level += (target - this.level) * smoothing
    if (this.level < 0.001) this.level = 0
    return this.level
  }

  /** Clears the envelope between capture generations. */
  reset(): void {
    this.level = 0
    this.noiseFloorDb = 0
  }
}
