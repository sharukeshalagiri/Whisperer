Parent instructions: [features AGENTS.md](../AGENTS.md).

## Capture safety

- This directory is the sole renderer capture owner. Do not create another microphone pipeline in overlay, tutorial, or a route.
- `pcm-worklet.js` is intentionally plain JavaScript loaded through Vite's `?url&no-inline` asset query. Keep it free of TypeScript syntax so `AudioContext.audioWorklet.addModule` receives an emitted JavaScript module, not an inlined data URL.
- UI controls request `recording.start`, `stop`, or `cancel`; only `events.onRecordingCommand` starts, flushes, or cancels local capture. This prevents start-event recursion.
- Capture with `getUserMedia` using an exact selected microphone ID when provided. Audio remains mono PCM and final submission is a PCM16 WAV.
- Enforce `MAX_RECORDING_DURATION_MS` and `MAX_RECORDING_AUDIO_BYTES` before appending a frame. Do not submit if the active generation was cancelled.
- Stop must await the AudioWorklet flush acknowledgement before WAV encoding and submission. Release tracks, graph nodes, timers, and the AudioContext on every terminal path.
- Preserve the phase machine: `idle`, `starting`, `recording`, `stopping`, `processing`, `error`. Keep React updates behind the mounted guard.

## Overlay presentation

- Treat `recording.reportMeter` as display-only data: report from the hub, never persist it or rebuild bootstrap at audio cadence.
- Measure real PCM through `AudioMeterEnvelope`; never replace microphone activity with random or timed waveform animation.
- Keep pill dimensions in `shared/overlay.ts`, use `overlay.css` rather than generic system-color panels, and keep capture-phase strings out of visible status copy.
- Drag only through the overlay-specific bridge. Main owns cursor coordinates, display clamping and the persisted docking edge; action circles are not drag surfaces.

## Tests

Keep WAV and lifecycle behavior pure and unit-tested. Browser APIs belong in `RecorderProvider`, not encoder or generation-controller tests.
