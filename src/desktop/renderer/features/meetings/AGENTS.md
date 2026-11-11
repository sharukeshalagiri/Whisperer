Parent instructions: [features AGENTS.md](../AGENTS.md).

## Ownership

- This directory is the sole renderer owner of the separate local meeting microphone capture engine.
- It may use the built-in browser `MediaRecorder` and `getUserMedia`.

## Capture safety

- Start microphone access only after `events.onMeetingCaptureCommand({ command: 'start' })`; controls request actions through `meetings.capture` and must not begin browser capture directly.
- Apply an exact selected microphone `deviceId` when configured. Request audio only, never display or system audio.
- Queue every WebM chunk in event order. Do not append or finish after its generation is cancelled.
- Stop waits for the queue before `finish`; all terminal paths stop tracks. Browser acquisition errors must tell main to release its capture mutex.

## Boundaries

- Main owns meeting metadata, file paths, byte limits, import/export dialogs, and cross-engine mutual exclusion.
- Content/Notetaker UI consumes exported hook state and actions; it does not construct another provider.
- Never manufacture transcripts, summaries, or a claim that system audio was captured.
- The status-pill meter samples only the already-open stream using the shared recording RMS envelope. Its interval and AudioContext must be released on every terminal path; it never requests a second microphone or persists meter values.

## Tests and documentation

- Keep cancellation generation and serialization behavior browser-independent and unit-tested.

## Learnings

None yet.
