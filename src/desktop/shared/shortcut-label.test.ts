import { describe, expect, test } from 'vitest'

import { shortcutLabel } from './shortcut-label'

describe('shortcutLabel', () => {
  test('uses macOS symbols and spacing', () => {
    expect(shortcutLabel('CommandOrControl+Shift+Space', 'darwin')).toBe('⌘ ⇧ Space')
  })

  test('uses named Windows and Linux modifiers', () => {
    expect(shortcutLabel('CommandOrControl+Shift+Space', 'win32')).toBe('Ctrl + Shift + Space')
    expect(shortcutLabel('Alt+F2', 'linux')).toBe('Alt + F2')
  })
})
