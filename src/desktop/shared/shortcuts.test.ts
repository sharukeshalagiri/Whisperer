import { describe, expect, it } from 'vitest'
import { electronAccelerator, FN_KEY_UNSUPPORTED, isFnKey, ShortcutCaptureParser, validateShortcut, captureShortcut, defaultShortcutBindings, migrateShortcutBindings, shortcutConflict, normalizeShortcut } from './shortcuts'

describe('shortcut bindings', () => {
  it('captures physical keys without putting text in an input', () => {
    expect(captureShortcut({ code: 'KeyK', key: 'k', ctrlKey: true, altKey: false, metaKey: false, shiftKey: true }, 'linux')).toBe('Control+Shift+K')
    expect(captureShortcut({ code: 'AltLeft', key: 'Alt', ctrlKey: false, altKey: true, metaKey: false, shiftKey: false }, 'linux')).toBe('Alt')
    expect(captureShortcut({ code: 'Fn', key: 'Fn', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }, 'darwin')).toBeNull()
  })
  it('normalizes aliases and detects equivalent platform collisions', () => {
    expect(normalizeShortcut('ctrl+shift+k', 'linux')).toBe('Control+Shift+K')
    const bindings = { ...defaultShortcutBindings(), copyLastTranscript: ['Control+Alt+Space'] }
    expect(shortcutConflict(bindings, 'copyLastTranscript', bindings.copyLastTranscript[0]!, 'linux')).toBe('toggleRecording')
  })
  it('migrates the old toggle shortcut without changing its behavior', () => {
    const bindings = migrateShortcutBindings({ shortcut: 'Alt+Q', holdToTalk: false, scratchpadShortcut: 'Alt+N' })
    expect(bindings.toggleRecording).toEqual(['Alt+Q'])
    expect(bindings.scratchpad).toEqual(['Alt+N'])
    expect(bindings.holdToTalk).not.toBe(bindings.toggleRecording)
  })
  it('preserves old hold and explicitly disabled scratchpad bindings', () => {
    const bindings = migrateShortcutBindings({ shortcut: 'Alt+Q', holdToTalk: true, scratchpadShortcut: '' })
    expect(bindings.holdToTalk).toEqual(['Alt+Q'])
    expect(bindings.scratchpad).toEqual([])
  })
  it('commits on first release and rejects left/right copies of a modifier', () => {
    const parser = new ShortcutCaptureParser('linux')
    const left = { code: 'ControlLeft', key: 'Control', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false }
    expect(parser.down(left)).toBe('Control')
    parser.down({ ...left, code: 'ControlRight' })
    expect(validateShortcut(parser.release()!, 'linux')).toContain('duplicate modifier')
    expect(parser.release()).toBeNull()
  })

  it('allows up to four keys and punctuation the native hook supports', () => {
    expect(validateShortcut('Control+Alt+Command+Space', 'darwin')).toBeNull()
    expect(validateShortcut('Alt+Space', 'darwin')).toBeNull()
    expect(validateShortcut('Alt+Comma', 'darwin')).toBeNull()
    expect(validateShortcut('Control+Alt+Command+Shift+Space', 'darwin')).toContain('4 or fewer')
    expect(electronAccelerator('Alt+Comma')).toBe('Alt+,')
  })

  it('reports the Fn key as unsupported instead of ignoring it', () => {
    expect(isFnKey({ key: 'Fn', code: '' })).toBe(true)
    expect(validateShortcut('Fn+Space', 'darwin')).toBe(FN_KEY_UNSUPPORTED)
  })
})
