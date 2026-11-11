import type { UpdateStatus } from '../../../shared/contracts'

/**
 * Describes an update check in one line for Settings and the notifications popover.
 *
 * Args:
 *   status: Latest release-feed check result.
 * Returns: A sentence naming what is known, never claiming a check that did not happen.
 */
export function updateSummary(status: UpdateStatus): string {
  if (status.checking) return 'Checking for updates...'
  if (status.update) return `Whisperer ${status.update.version} is available. You have ${status.currentVersion}.`
  if (status.error) return `Could not check for updates. ${status.error}`
  if (status.checkedAt) return `Whisperer ${status.currentVersion} is the latest version.`
  return `Whisperer ${status.currentVersion}. Not checked for updates yet.`
}

/**
 * Formats an installer size for a download button.
 *
 * Args:
 *   bytes: Installer size in bytes.
 * Returns: Size in megabytes with one decimal, or an empty string when unknown.
 */
export function formatInstallerSize(bytes: number): string {
  return bytes > 0 ? `${(bytes / 1_000_000).toFixed(1)} MB` : ''
}
