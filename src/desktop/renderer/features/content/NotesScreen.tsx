/* Exported presentation helpers are deliberately unit-tested beside this component. */
/* eslint-disable react-refresh/only-export-components */
import {
  Check,
  CircleHelp,
  FilePlus2,
  MoreHorizontal,
  Pin,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { Capabilities, DesktopPlatform, Note, PublicSettings } from '../../../shared/contracts'
import { ShortcutRecorder } from '../device/ShortcutRecorder'
import {
  bootstrapScratchpad,
  listNotes,
  onNotesChanged,
  openNote,
  summarizeNote,
  updateScratchpadSettings,
} from './api'
import { syncStateLabel } from './sync-state'
import { errorMessage, useContentList } from './use-content-list'

interface ScratchpadControls {
  settings: Pick<PublicSettings, 'scratchpadInBar' | 'scratchpadShortcut'>
  capabilities: Capabilities
  platform: DesktopPlatform
}

/** Displays the Scratchpad landing page and opens notes in their dedicated window. */
export function NotesScreen(): React.JSX.Element {
  const { error: loadError, isLoading, items, reload } = useContentList(listNotes, onNotesChanged)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [controls, setControls] = useState<ScratchpadControls>()
  const [actionError, setActionError] = useState<string>()
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    let mounted = true
    void bootstrapScratchpad()
      .then((state) => {
        if (!mounted) return
        setControls({
          settings: {
            scratchpadInBar: state.settings.scratchpadInBar,
            scratchpadShortcut: state.settings.scratchpadShortcut,
          },
          capabilities: state.capabilities,
          platform: state.platform,
        })
      })
      .catch(() => {
        // The landing remains useful when the optional shortcut controls cannot be read.
      })
    return () => {
      mounted = false
    }
  }, [])

  const recentNotes = sortRecentNotes(items).filter((note) => matchesNote(note, search))
  const supportsShortcut = controls?.capabilities.globalShortcut.supported ?? false

  /** Opens a fresh standalone Scratchpad window. */
  const createNote = useCallback(async () => {
    setActionError(undefined)
    try {
      await openNote()
    } catch (reason) {
      setActionError(errorMessage(reason))
    }
  }, [])

  /** Opens an existing note and exposes a recoverable failure without changing the landing design. */
  const openExistingNote = useCallback(async (id: string) => {
    setActionError(undefined)
    try {
      await openNote(id)
    } catch (reason) {
      setActionError(errorMessage(reason))
    }
  }, [])

  /** Refreshes recents and makes the quiet progress state available to screen readers. */
  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setActionError(undefined)
    try {
      await reload()
    } catch (reason) {
      setActionError(errorMessage(reason))
    } finally {
      setIsRefreshing(false)
    }
  }, [reload])

  /** Persists an actual desktop setting rather than presenting a decorative switch. */
  const updateControls = useCallback(async (partial: Partial<ScratchpadControls['settings']>) => {
    if (!controls) return
    setActionError(undefined)
    try {
      const settings = await updateScratchpadSettings(partial)
      setControls((current) =>
        current
          ? {
              ...current,
              settings: {
                scratchpadInBar: settings.scratchpadInBar,
                scratchpadShortcut: settings.scratchpadShortcut,
              },
            }
          : current,
      )
    } catch (reason) {
      setActionError(errorMessage(reason))
    }
  }, [controls])

  /** Calls the server summary action only for a completed, server-synced note. */
  const summarize = useCallback(async (note: Note) => {
    setActionError(undefined)
    try {
      await summarizeNote(note.id)
      await reload()
    } catch (reason) {
      setActionError(errorMessage(reason))
    }
  }, [reload])

  return (
    <main className="page content-page scratchpad-page">
      <header className="scratchpad-page-header">
        <div className="scratchpad-heading">
          <h1>Scratchpad</h1>
          <span className="scratchpad-beta">Beta</span>
        </div>
        {controls ? (
          <div className="scratchpad-settings" aria-label="Scratchpad settings">
            <label className="scratchpad-bar-setting">
              <span>Add to Whisperer Bar</span>
              <CircleHelp aria-label="Show Scratchpad in the Whisperer Bar" size={15} />
              <button
                aria-checked={controls.settings.scratchpadInBar}
                aria-label="Add Scratchpad to Whisperer Bar"
                className="scratchpad-switch"
                onClick={() => void updateControls({ scratchpadInBar: !controls.settings.scratchpadInBar })}
                role="switch"
                type="button"
              >
                <span />
              </button>
            </label>
            {supportsShortcut ? (
              <div className="scratchpad-shortcut-setting">
                {/* Shows key symbols instead of accelerator text and records a new chord on click. */}
                <ShortcutRecorder
                  actionLabel="Scratchpad"
                  onChange={(shortcut) => {
                    if (shortcut && shortcut !== controls.settings.scratchpadShortcut) {
                      void updateControls({ scratchpadShortcut: shortcut })
                    }
                  }}
                  platform={controls.platform}
                  removable={false}
                  value={controls.settings.scratchpadShortcut}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className="scratchpad-hero" aria-labelledby="scratchpad-hero-title">
        <div className="scratchpad-hero-copy">
          <h2 id="scratchpad-hero-title">For quick thoughts you want to come back to</h2>
          <p>Drop a to-do list, polish a message before you send it, brain dump an idea. Scratchpad is your safe space to save, create, and explore.</p>
          <button className="scratchpad-start-button" onClick={() => void createNote()} type="button">
            Start new note
          </button>
        </div>
        <div aria-hidden="true" className="scratchpad-hero-preview">
          <div className="hero-preview-tab">Untitled <span>×</span></div>
          <p>A place for the thought you do not want to lose.</p>
        </div>
      </section>

      <section className="scratchpad-recents" aria-labelledby="scratchpad-recents-title">
        <div className="scratchpad-recents-header">
          <h2 id="scratchpad-recents-title">Recents</h2>
          <div className="scratchpad-recents-actions">
            <button aria-expanded={searchOpen} aria-label="Search notes" className="scratchpad-action" onClick={() => setSearchOpen((open) => !open)} type="button">
              <Search aria-hidden="true" size={18} />
            </button>
            <button aria-label="New note" className="scratchpad-action" onClick={() => void createNote()} type="button">
              <Plus aria-hidden="true" size={19} />
            </button>
            <button aria-label="Refresh notes" className="scratchpad-action" disabled={isRefreshing} onClick={() => void refresh()} type="button">
              <RefreshCw aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
        {searchOpen ? (
          <label className="scratchpad-search-field">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Search notes</span>
            <input autoFocus onChange={(event) => setSearch(event.target.value)} placeholder="Search notes" value={search} />
          </label>
        ) : null}
        {actionError ? <ContentError message={actionError} retry={refresh} /> : null}
        {isLoading ? <p className="content-status">Loading notes…</p> : null}
        {loadError ? <ContentError message={loadError} retry={reload} /> : null}
        {!isLoading && !loadError && recentNotes.length === 0 ? (
          <div className="scratchpad-empty-state">
            <p>{items.length ? 'No notes match your search.' : 'Your recent notes will appear here.'}</p>
            <button className="scratchpad-start-button" onClick={() => void createNote()} type="button"><FilePlus2 aria-hidden="true" size={17} /> Start new note</button>
          </div>
        ) : null}
        <div className="scratchpad-note-list" role="list">
          {recentNotes.map((note) => (
            <article className="scratchpad-note-card" key={note.id} role="listitem">
              <button className="scratchpad-note-open" onClick={() => void openExistingNote(note.id)} type="button">
                <span className="scratchpad-note-title">{displayNoteTitle(note)}</span>
                <span className="scratchpad-note-preview">{notePreview(note.content)}</span>
                <span className="scratchpad-note-meta">
                  {note.pinned ? <Pin aria-label="Pinned" size={14} /> : null}
                  <time dateTime={note.updatedAt}>{formatRecentDate(note.updatedAt)}</time>
                  <time dateTime={note.updatedAt}>{formatRecentTime(note.updatedAt)}</time>
                  {note.syncState !== 'synced' ? <span className={`scratchpad-sync scratchpad-sync--${note.syncState}`}>{syncStateLabel(note.syncState)}</span> : null}
                </span>
              </button>
              <details className="scratchpad-note-menu">
                <summary aria-label={`Actions for ${displayNoteTitle(note)}`}><MoreHorizontal aria-hidden="true" size={17} /></summary>
                <div>
                  {note.syncState === 'synced' ? <button onClick={() => void summarize(note)} type="button">Summarize</button> : <span>Summary available after sync</span>}
                  <button onClick={() => void openExistingNote(note.id)} type="button">Transform in Scratchpad</button>
                  {note.summary ? <span className="scratchpad-summary-ready"><Check aria-hidden="true" size={13} /> Summary ready</span> : null}
                </div>
              </details>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

/** Shows a recoverable local-data error consistently across content screens. */
export function ContentError({ message, retry }: { message: string; retry: () => Promise<void> }): React.JSX.Element {
  return <div className="content-error" role="alert"><p>{message}</p><button className="button" onClick={() => void retry()} type="button">Try again</button></div>
}

/** Orders pinned notes first, then remaining notes by their most recent update. */
export function sortRecentNotes(notes: Note[]): Note[] {
  return [...notes].sort((left, right) => Number(right.pinned) - Number(left.pinned) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

/** Returns a stable label for an untitled note. */
export function displayNoteTitle(note: Pick<Note, 'title'>): string {
  return note.title.trim() || 'Untitled note'
}

/** Collapses note text into the compact, single-line recents preview. */
export function notePreview(content: string): string {
  const collapsed = content.replace(/\s+/gu, ' ').trim()
  return collapsed ? collapsed.slice(0, 180) : 'Empty note'
}

/** Returns whether a note's visible text contains the typed search query. */
function matchesNote(note: Note, query: string): boolean {
  return !query.trim() || `${note.title} ${note.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}

/** Formats an available timestamp with the date treatment used in the recents cards. */
function formatRecentDate(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? 'No date available' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

/** Formats an available timestamp with a compact time treatment. */
function formatRecentTime(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}
