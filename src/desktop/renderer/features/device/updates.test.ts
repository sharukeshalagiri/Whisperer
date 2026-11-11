import { describe, expect, test } from 'vitest'

import type { UpdateStatus } from '../../../shared/contracts'
import { formatInstallerSize, updateSummary } from './updates'

const BASE: UpdateStatus = { currentVersion: '0.2.0', checking: false, checkedAt: null, update: null, error: null }

describe('updateSummary', () => {
  test('never claims a check that has not happened, and names each outcome', () => {
    expect(updateSummary(BASE)).toBe('Whisperer 0.2.0. Not checked for updates yet.')
    expect(updateSummary({ ...BASE, checking: true })).toBe('Checking for updates...')
    expect(updateSummary({ ...BASE, checkedAt: '2026-10-17T20:00:00Z' })).toBe('Whisperer 0.2.0 is the latest version.')
    expect(updateSummary({ ...BASE, error: 'The release feed answered HTTP 404.' })).toBe('Could not check for updates. The release feed answered HTTP 404.')
  })

  test('keeps offering a found update after a later failure', () => {
    const update = { version: '0.3.0', name: 'Whisperer 0.3.0', prerelease: false, publishedAt: null, pageUrl: 'https://x/r', downloadUrl: 'https://x/d', assetName: 'Whisperer-0.3.0-linux-amd64.deb', bytes: 1 }
    expect(updateSummary({ ...BASE, update, error: 'offline' })).toBe('Whisperer 0.3.0 is available. You have 0.2.0.')
  })
})

test('formatInstallerSize shows megabytes or nothing', () => {
  expect(formatInstallerSize(140_000_000)).toBe('140.0 MB')
  expect(formatInstallerSize(0)).toBe('')
})
