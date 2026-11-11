import { describe, expect, test } from 'vitest'

import type { Capabilities, Capability } from '../../../shared/contracts'
import { AUTOMATION_UNCHECKED, needsPreflight, preflightItems, preflightReady } from './permissionCheck'

const granted: Capability = { supported: true, granted: true, reason: null }
const missing: Capability = { supported: true, granted: false, reason: 'Grant access.' }

/** Builds a capability report where every item starts granted. */
function capabilities(overrides: Partial<Capabilities> = {}): Capabilities {
  return {
    microphone: granted, accessibility: granted, automation: granted, globalShortcut: granted,
    autoPaste: granted, holdToTalk: granted, systemAudio: granted, ...overrides,
  }
}

describe('permission preflight', () => {
  test('stays hidden when every macOS permission is granted', () => {
    expect(needsPreflight('darwin', capabilities(), false)).toBe(false)
  })

  test('opens for a stale Accessibility grant until the user continues', () => {
    const state = capabilities({ accessibility: missing })
    expect(needsPreflight('darwin', state, false)).toBe(true)
    expect(needsPreflight('darwin', state, true)).toBe(false)
  })

  test('does not open only because Automation has not been probed yet', () => {
    const unchecked = { supported: true, granted: false, reason: AUTOMATION_UNCHECKED }
    expect(needsPreflight('darwin', capabilities({ automation: unchecked }), false)).toBe(false)
    expect(needsPreflight('darwin', capabilities({ automation: missing }), false)).toBe(true)
  })

  test('never blocks platforms without these macOS permissions', () => {
    expect(needsPreflight('linux', capabilities({ accessibility: missing }), false)).toBe(false)
  })

  test('treats a confirmed microphone probe and unsupported items as ready', () => {
    const items = preflightItems(capabilities({ microphone: missing, automation: { supported: false, granted: false, reason: null } }), true)
    expect(preflightReady(items)).toBe(true)
    expect(items.find((item) => item.id === 'automation')?.required).toBe(false)
  })
})
