import { describe, expect, it, vi } from 'vitest'

import { canContinuePermissions, confirmedMicrophonePermission, confirmMicrophoneAccess } from './onboardingPermissions'

const linuxMicrophone = {
  supported: true,
  granted: false,
  reason: 'Microphone permission cannot be queried on this platform.',
}

/** Verifies actual browser permission evidence rather than inferring access from the native request. */
describe('onboarding microphone permission', () => {
  it('confirms a successful probe only after every acquired track is stopped', async () => {
    const order: string[] = []
    let confirmed = false
    const tracks = ['audio', 'extra'].map((name) => ({ stop: () => order.push(name) }))
    await confirmMicrophoneAccess(
      async () => ({ getTracks: () => tracks }),
      () => {
        order.push('confirmed')
        confirmed = true
      },
    )
    expect(order).toEqual(['audio', 'extra', 'confirmed'])
    expect(confirmedMicrophonePermission(linuxMicrophone, confirmed)).toEqual({
      supported: true,
      granted: true,
      reason: null,
    })
    // A later native refresh still cannot query Linux permission; real session evidence must survive it.
    expect(confirmedMicrophonePermission({ ...linuxMicrophone }, confirmed).granted).toBe(true)
  })

  it('does not enable the gate or claim access when browser permission fails', async () => {
    const onConfirmed = vi.fn()
    const error = new Error('Microphone access denied')
    await expect(
      confirmMicrophoneAccess(async () => {
        throw error
      }, onConfirmed),
    ).rejects.toBe(error)
    expect(onConfirmed).not.toHaveBeenCalled()
    expect(confirmedMicrophonePermission(linuxMicrophone, false)).toBe(linuxMicrophone)
    expect(confirmedMicrophonePermission(linuxMicrophone, false).granted).toBe(false)
  })

  it('continues with microphone access alone because insertion falls back to the clipboard', () => {
    expect(canContinuePermissions({ supported: true, granted: true, reason: null })).toBe(true)
    expect(canContinuePermissions(linuxMicrophone)).toBe(false)
    expect(canContinuePermissions({ supported: false, granted: false, reason: 'Unavailable here.' })).toBe(true)
  })

  it('preserves a genuine native grant without requiring another browser probe', () => {
    const native = { supported: true, granted: true, reason: null }
    expect(confirmedMicrophonePermission(native, false)).toBe(native)
  })
})
