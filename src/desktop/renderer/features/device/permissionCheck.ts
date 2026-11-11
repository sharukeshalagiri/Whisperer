import type { Capabilities, Capability, DesktopPlatform } from '../../../shared/contracts'

/** Permissions the preflight checklist can request or open settings for. */
export type PreflightPermission = 'microphone' | 'accessibility' | 'automation'

/** One row of the preflight checklist. */
export interface PreflightItem {
  id: PreflightPermission
  title: string
  description: string
  capability: Capability
  /** Whether the item applies to this device; unsupported items are shown as not required. */
  required: boolean
  ready: boolean
}

const COPY: Record<PreflightPermission, { title: string; description: string }> = {
  microphone: {
    title: 'Microphone',
    description: 'Hear you while you dictate. Whisperer only listens while recording.',
  },
  accessibility: {
    title: 'Accessibility',
    description: 'Detect your shortcuts and type dictated text where your cursor is.',
  },
  automation: {
    title: 'Automation for System Events',
    description: 'Paste into the app you are using and check that it is still in front.',
  },
}

/**
 * Builds the preflight checklist from reported capabilities.
 *
 * Args:
 *   capabilities: Main-process capability report.
 *   microphoneConfirmed: Whether a real capture probe succeeded in this session.
 * Returns:
 *   One row per permission, in the order the user should grant them.
 */
export function preflightItems(capabilities: Capabilities, microphoneConfirmed = false): PreflightItem[] {
  return (['microphone', 'accessibility', 'automation'] as const).map((id) => {
    const reported = capabilities[id]
    const capability = id === 'microphone' && microphoneConfirmed ? { ...reported, granted: true, reason: null } : reported
    return { id, ...COPY[id], capability, required: capability.supported, ready: !capability.supported || capability.granted }
  })
}

/** Returns whether every applicable permission is granted. */
export function preflightReady(items: readonly PreflightItem[]): boolean {
  return items.every((item) => item.ready)
}

/**
 * Decides whether to show the checklist before the main window.
 *
 * Args:
 *   platform: Desktop operating system.
 *   capabilities: Main-process capability report.
 *   dismissed: Whether the user chose to continue for this launch.
 * Returns:
 *   True on macOS while any applicable permission is missing and the user has not dismissed it.
 */
export function needsPreflight(platform: DesktopPlatform, capabilities: Capabilities, dismissed: boolean): boolean {
  if (dismissed || platform !== 'darwin') return false
  // Automation is only known after a probe, so an unchecked state alone never opens the checklist.
  return preflightItems(capabilities).some((item) => !item.ready && !(item.id === 'automation' && item.capability.reason === AUTOMATION_UNCHECKED))
}

/** Main-process reason for Automation consent that has not been probed in this launch. */
export const AUTOMATION_UNCHECKED = 'Not checked yet.'
