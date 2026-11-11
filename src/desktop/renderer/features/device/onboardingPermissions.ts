import type { Capability } from '../../../shared/contracts'

/** Stops the permission probe before confirming that this session can actually access the mic. */
export async function confirmMicrophoneAccess(
  acquire: () => Promise<{ getTracks: () => Pick<MediaStreamTrack, 'stop'>[] }>,
  onConfirmed: () => void,
): Promise<void> {
  const stream = await acquire()
  stream.getTracks().forEach((track) => track.stop())
  onConfirmed()
}

/**
 * Decides whether device setup may continue.
 *
 * Args:
 *   microphone: The microphone capability, including any session probe.
 * Returns:
 *   True when dictation can capture audio. Insertion access is optional because
 *   completed dictation falls back to the clipboard without it.
 */
export function canContinuePermissions(microphone: Capability): boolean {
  return !microphone.supported || microphone.granted
}

/** Combines a real session probe with native status that cannot query access on every platform. */
export function confirmedMicrophonePermission(native: Capability, confirmed: boolean): Capability {
  return confirmed ? { ...native, granted: true, reason: null } : native
}
