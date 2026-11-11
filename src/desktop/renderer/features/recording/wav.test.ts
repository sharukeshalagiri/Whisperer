import { describe, expect, it } from 'vitest';

import { encodePcm16MonoWav, wavByteLength } from './wav';

describe('encodePcm16MonoWav', () => {
  it('writes a mono PCM16 WAV header and clamps samples', () => {
    const wav = encodePcm16MonoWav([new Float32Array([-2, -1, 0, 1, 2])], 16_000);
    const view = new DataView(wav.buffer);

    expect(wav.byteLength).toBe(wavByteLength(5));
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect([...Array(5)].map((_, index) => view.getInt16(44 + index * 2, true))).toEqual([-32768, -32768, 0, 32767, 32767]);
  });

  it('rejects invalid sample rates rather than emitting a malformed header', () => {
    expect(() => encodePcm16MonoWav([], 0)).toThrow('positive integer sample rate');
    expect(() => encodePcm16MonoWav([], 44_100.5)).toThrow('positive integer sample rate');
  });
});
