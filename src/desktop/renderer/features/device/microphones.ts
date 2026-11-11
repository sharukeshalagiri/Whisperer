/** One selectable microphone. `default` is the system default input. */
export interface MicrophoneOption {
  deviceId: string
  label: string
}

/**
 * Turn the browser's device list into microphone choices, system default first.
 *
 * Args:
 *   devices: Result of `navigator.mediaDevices.enumerateDevices()`.
 * Returns:
 *   The system default followed by each named input, without duplicates.
 */
export function microphoneOptions(devices: ReadonlyArray<Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>>): MicrophoneOption[] {
  const inputs = devices.filter((device) => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications')
  const options: MicrophoneOption[] = [{ deviceId: 'default', label: 'System default' }]
  for (const [index, device] of inputs.entries()) {
    if (options.some((option) => option.deviceId === device.deviceId)) continue
    options.push({ deviceId: device.deviceId, label: device.label || `Microphone ${index + 1}` })
  }
  return options
}

/** The saved microphone's name for display, or the system default. */
export function microphoneLabel(options: readonly MicrophoneOption[], microphoneId: string | null | undefined): string {
  if (!microphoneId || microphoneId === 'default') return 'System default'
  return options.find((option) => option.deviceId === microphoneId)?.label ?? 'Selected microphone'
}
