import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MeetingQuestionPanel, MeetingTextSurface, SafeMeetingMarkdown } from './MeetingDetail'
import type { Meeting } from './api'

describe('meeting detail presentation safety', () => {
  it('renders Markdown links as inert text and suppresses remote images', () => {
    const markup = renderToStaticMarkup(createElement(SafeMeetingMarkdown, {
      text: 'Read [the decision](https://example.invalid/decision).\n\n![Remote image](https://example.invalid/image.png)',
    }))

    expect(markup).toContain('the decision')
    expect(markup).not.toMatch(/href=|src=|<img\b/u)
  })

  it('keeps questions disabled while a transcript is incomplete', () => {
    const meeting: Meeting = {
      id: 'meeting', title: 'Pending', startedAt: '2026-10-17T12:00:00.000Z', endedAt: null,
      durationMs: 0, historyEntryIds: [], hasAudio: false, transcript: 'Partial text',
      transcriptRevision: 1, summaryRevision: 0, transcriptStatus: 'running', summaryStatus: 'idle', syncState: 'synced',
    }
    const markup = renderToStaticMarkup(createElement(MeetingQuestionPanel, { dirty: false, meeting }))

    expect(markup).toContain('Transcript is still preparing')
    expect(markup).toMatch(/aria-label="Ask question"[^>]*disabled/u)
  })

  it('locks every mutable editor control while a save is in flight', () => {
    const markup = renderToStaticMarkup(createElement(MeetingTextSurface, {
      concurrentChange: false,
      duration: '30m 0s',
      editing: true,
      field: 'transcript',
      onCancel: () => undefined,
      onChange: () => undefined,
      onCopy: () => undefined,
      onEdit: () => undefined,
      onSave: () => undefined,
      onTransform: () => undefined,
      pollingExhausted: false,
      saving: true,
      stale: false,
      status: 'complete',
      text: 'A saved draft.',
    }))

    expect(markup).toMatch(/<textarea[^>]*disabled/u)
    expect((markup.match(/disabled=""/gu) ?? [])).toHaveLength(4)
  })
})
