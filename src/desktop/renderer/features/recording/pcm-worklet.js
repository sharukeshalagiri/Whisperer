/* AudioWorkletGlobalScope module: it intentionally has no window, React, or Electron imports. */

/** Captures and packetizes microphone PCM without ever playing it back. */
class WhispererPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.packet = new Float32Array(4096);
    this.offset = 0;
    this.port.onmessage = ({ data }) => {
      if (data?.type !== 'flush') return;
      this.emitPacket();
      this.port.postMessage({ type: 'flushed', generation: data.generation });
    };
  }

  /** Emits the buffered PCM, transferring its backing store to avoid a copy. */
  emitPacket() {
    if (!this.offset) return;
    const frames = this.packet.slice(0, this.offset);
    let peak = 0;
    for (const sample of frames) peak = Math.max(peak, Math.abs(sample));
    this.port.postMessage({ type: 'frames', frames, peak }, [frames.buffer]);
    this.packet = new Float32Array(4096);
    this.offset = 0;
  }

  /** Mixes input channels to mono and keeps the graph alive until disconnected. */
  process(inputs) {
    const channels = inputs[0];
    const firstChannel = channels?.[0];
    if (!channels?.length || !firstChannel) return true;

    for (let frame = 0; frame < firstChannel.length; frame += 1) {
      let mixed = 0;
      for (const channel of channels) mixed += channel[frame] ?? 0;
      this.packet[this.offset] = mixed / channels.length;
      this.offset += 1;
      if (this.offset === this.packet.length) this.emitPacket();
    }
    return true;
  }
}

registerProcessor('whisperer-pcm-capture', WhispererPcmCaptureProcessor);
