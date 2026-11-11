import { describe, expect, it } from 'vitest'
import { ShortcutActionDispatcher, shortcutActionAllowed } from './ShortcutRuntimeService'

describe('shortcut dispatch', () => {
  it('submits on hold release and ignores Escape while idle', async () => {
    const calls: string[] = []
    let now = 0
    const dispatch = new ShortcutActionDispatcher({ start: async (mode) => { calls.push(mode) }, stop: async () => { calls.push('stop') }, cancel: async () => { calls.push('cancel') }, action: async (id) => { calls.push(id) }, now: () => now })
    await dispatch.down('cancel')
    await dispatch.down('holdToTalk')
    now = 600
    await dispatch.up('holdToTalk')
    expect(calls).toEqual(['push-to-talk', 'stop'])
  })
  it('double-tap locks handsfree and release does not submit', async () => {
    const calls: string[] = []
    let now = 0
    const dispatch = new ShortcutActionDispatcher({ start: async (mode) => { calls.push(mode) }, stop: async () => { calls.push('stop') }, cancel: async () => { calls.push('cancel') }, action: async (id) => { calls.push(id) }, now: () => now })
    await dispatch.down('holdToTalk'); now = 100; await dispatch.up('holdToTalk')
    now = 200; await dispatch.down('holdToTalk'); await dispatch.up('holdToTalk')
    expect(calls).toEqual(['push-to-talk', 'cancel', 'handsfree'])
    now = 900; await dispatch.down('holdToTalk')
    expect(calls.at(-1)).toBe('stop')
  })
  it('does not submit when the PTT chord is upgraded to handsfree', async () => {
    const calls: string[] = []
    const dispatch = new ShortcutActionDispatcher({ start: async () => { calls.push('start') }, stop: async () => { calls.push('stop') }, cancel: async () => {}, action: async () => {}, now: () => 0 })
    await dispatch.down('holdToTalk'); await dispatch.down('toggleRecording'); await dispatch.up('holdToTalk')
    expect(calls).toEqual(['start'])
  })
  it('allows only dictation actions during onboarding and none while capturing', () => {
    const onboarding = { signedIn: true, onboardingCompleted: false, capturing: false }
    expect(shortcutActionAllowed('holdToTalk', onboarding)).toBe(true)
    expect(shortcutActionAllowed('cancel', onboarding)).toBe(true)
    expect(shortcutActionAllowed('pasteLastTranscript', onboarding)).toBe(false)
    expect(shortcutActionAllowed('holdToTalk', { ...onboarding, onboardingCompleted: true, capturing: true })).toBe(false)
    expect(shortcutActionAllowed('scratchpad', { signedIn: false, onboardingCompleted: true, capturing: false })).toBe(false)
  })
  it('opens Notetaker on a third quick push-to-talk tap', async () => {
    const calls: string[] = []
    const dispatch = new ShortcutActionDispatcher({ start: async (mode) => { calls.push(mode) }, stop: async () => { calls.push('stop') }, cancel: async () => { calls.push('cancel') }, action: async (id) => { calls.push(id) }, canStartMeeting: () => true })
    await dispatch.down('holdToTalk', 0); await dispatch.up('holdToTalk', 100)
    await dispatch.down('holdToTalk', 200); await dispatch.up('holdToTalk', 250)
    await dispatch.down('holdToTalk', 400)
    expect(calls).toEqual(['push-to-talk', 'cancel', 'handsfree', 'cancel', 'startMeeting'])
  })
})
