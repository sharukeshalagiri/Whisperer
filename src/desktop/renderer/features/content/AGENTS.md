Parent instructions: [features AGENTS.md](../AGENTS.md).

- Keep all persistence behind `api.ts` and only call the narrow `window.whisperer` operations approved for these screens.
- Do not use remote URLs or manufacture content when a store returns no entries.
- Preserve the note save barrier: summaries, tab switches, tab close, delete, and window close wait for the latest queued save; completed writes never replace newer editor state.
- Scratchpad landing controls may change only typed desktop settings or capability-backed actions. Do not render a working-looking control for an unsupported bridge capability, and do not serialize unsupported rich-text or version-history formats into `Note.content`.
- Keep Scratchpad styling in `content.css` and Dictionary, Snippets, Notetaker, and history styling in `ui-content.css`; use shell tokens and shared page primitives rather than inventing an accent palette.
- Notetaker home selection may preview a meeting in its overview pane, but only an explicit `Open note` action enters the full workspace. Keep its two authoritative tabs as Transcript and Summary; flat transcript data never gains invented speakers, and summary Markdown must reject raw HTML, links that navigate, and remote images.
- Background meeting refreshes and `onMeetingsChanged` invalidations must retain each dirty draft, update the open workspace from full authoritative records, and stop polling after a finite budget with a visible manual recovery action.
- Meeting questions use only the typed `meetings.ask` bridge. Do not create renderer networking, local model calls, persistent chat history, fabricated answers, or meeting/dictionary/metric writes. Keep the saved-draft warning, in-flight duplicate guard, stale navigation guard, Markdown safety, keyboard behavior, and an explicit error retry.

## Learnings

None yet.
