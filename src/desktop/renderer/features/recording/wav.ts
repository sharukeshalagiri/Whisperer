/** A PCM packet produced by the recorder AudioWorklet. */
export type PcmFrames = readonly Float32Array[];

export const WAV_HEADER_BYTES = 44;
export const PCM16_BYTES_PER_SAMPLE = 2;

/** Returns the final WAV byte length for a mono PCM16 frame count. */
export function wavByteLength(frameCount: number): number {
  return WAV_HEADER_BYTES + frameCount * PCM16_BYTES_PER_SAMPLE;
}

/**
 * Encodes mono Float32 PCM packets as a little-endian PCM16 WAV file.
 *
 * Samples outside the valid Web Audio range are clamped rather than wrapped,
 * so hostile or malformed input cannot corrupt the resulting audio container.
 */
export function encodePcm16MonoWav(frames: PcmFrames, sampleRate: number): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error('A positive integer sample rate is required.');
  }

  const frameCount = frames.reduce((total, frame) => total + frame.length, 0);
  const byteLength = wavByteLength(frameCount);
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };

  writeText(0, 'RIFF');
  view.setUint32(4, byteLength - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * PCM16_BYTES_PER_SAMPLE, true);
  view.setUint16(32, PCM16_BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, frameCount * PCM16_BYTES_PER_SAMPLE, true);

  let offset = WAV_HEADER_BYTES;
  for (const frame of frames) {
    for (const sample of frame) {
      const normalized = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, normalized < 0 ? normalized * 32768 : normalized * 32767, true);
      offset += PCM16_BYTES_PER_SAMPLE;
    }
  }

  return bytes;
}
