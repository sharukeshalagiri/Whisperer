import { describe, expect, it } from 'vitest'

import { microphoneLabel, microphoneOptions } from './microphones'

describe('microphoneOptions', () => {
  it('lists the system default first and every distinct input after it', () => {
    const options = microphoneOptions([
      { deviceId: 'default', kind: 'audioinput', label: 'Default - Headset' },
      { deviceId: 'usb', kind: 'audioinput', label: 'USB microphone' },
      { deviceId: 'cam', kind: 'videoinput', label: 'Camera' },
      { deviceId: 'usb', kind: 'audioinput', label: 'USB microphone' },
      { deviceId: 'blank', kind: 'audioinput', label: '' },
    ])
    expect(options).toEqual([
      { deviceId: 'default', label: 'System default' },
      { deviceId: 'usb', label: 'USB microphone' },
      { deviceId: 'blank', label: 'Microphone 3' },
    ])
  })

  it('names the saved microphone', () => {
    const options = microphoneOptions([{ deviceId: 'usb', kind: 'audioinput', label: 'USB microphone' }])
    expect(microphoneLabel(options, 'usb')).toBe('USB microphone')
    expect(microphoneLabel(options, null)).toBe('System default')
    expect(microphoneLabel(options, 'gone')).toBe('Selected microphone')
  })
})
