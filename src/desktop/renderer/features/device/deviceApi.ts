import type {
  BootstrapState,
  Capabilities,
  CapabilityId,
  PublicSettings,
  PublicSettingsUpdate,
} from '../../../shared/contracts'

/** Public device settings as defined by the shared IPC contract. */
export type DeviceSettings = PublicSettings

/** Per-platform capability states as defined by the shared IPC contract. */
export type DeviceCapabilities = Capabilities

/** Reads public settings from complete bootstrap state. */
export function readSettings(state: BootstrapState): DeviceSettings {
  return state.settings
}

/** Reads platform capability state from complete bootstrap state. */
export function readCapabilities(state: BootstrapState): DeviceCapabilities {
  return state.capabilities
}

/** Persists renderer-editable device preferences through the preload bridge. */
export async function updateDeviceSettings(partial: PublicSettingsUpdate): Promise<PublicSettings> {
  return window.whisperer.settings.update(partial)
}

/** Converts unknown errors into copy that is safe to show in the UI. */
export function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Requests a named operating-system capability through the preload bridge. */
export async function requestPermission(type: CapabilityId): Promise<void> {
  await window.whisperer.permissions.request(type)
}

/** Lists the platform capability states exposed by the preload bridge. */
export async function listPermissions(): Promise<Capabilities> {
  return window.whisperer.permissions.list()
}
