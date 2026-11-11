import { FileAudio, MoreHorizontal, PauseCircle, PlayCircle, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { deleteMeeting, listMeetings, onMeetingsChanged, saveMeeting } from './api'
import type { Meeting } from './api'
import { CaptureTitleDialog, MeetingDetail, RenameMeetingDialog } from './MeetingDetail'
import { formatDate } from './format'
import { meetingProcessingLabel } from './meeting-detail-state'
import { filterMeetings, formatHistoryTime, meetingDayLabel } from './ui-screen-utils'
import { ContentError } from './NotesScreen'
import { errorMessage, useContentList } from './use-content-list'
import { useMeetingCapture } from '../meetings'

interface RenameForm {
  meeting: Meeting
  title: string
}

/** Renders the Notetaker home workspace and routes an explicit open action to detail. */
export function MeetingsScreen(): React.JSX.Element {
  const { error: loadError, isLoading, items, reload, setItems } = useContentList(listMeetings)
  const capture = useMeetingCapture()
  const [selectedId, setSelectedId] = useState<string>()
  const [previewId, setPreviewId] = useState<string>()
  const [captureTitle, setCaptureTitle] = useState<string | undefined>()
  const [renameForm, setRenameForm] = useState<RenameForm | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [isRenaming, setIsRenaming] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [query, setQuery] = useState('')
  const hadCapture = useRef(false)
  const selected = items.find(({ id }) => id === selectedId)
  const displayedMeetings = useMemo(() => filterMeetings(items, query), [items, query])
  const meetingGroups = useMemo(() => groupMeetings(displayedMeetings), [displayedMeetings])
  const preview = displayedMeetings.find(({ id }) => id === previewId) ?? displayedMeetings[0]
  const elapsed = useCaptureElapsed(capture.state?.startedAt)

  const replaceMeeting = useCallback((next: Meeting): void => {
    setItems((meetings) => {
      const existing = meetings.findIndex(({ id }) => id === next.id)
      return existing < 0 ? [next, ...meetings] : meetings.map((meeting) => meeting.id === next.id ? next : meeting)
    })
  }, [setItems])

  /** Reconciles cache invalidations without hiding visible rows during a background refresh. */
  const refreshMeetings = useCallback((): void => {
    void listMeetings().then(setItems).catch((reason) => setError(errorMessage(reason)))
  }, [setItems])

  useEffect(() => onMeetingsChanged(refreshMeetings), [refreshMeetings])
  useEffect(() => {
    if (!previewId && items[0]) setPreviewId(items[0].id)
  }, [items, previewId])
  useEffect(() => {
    if (!capture.state && hadCapture.current) {
      hadCapture.current = false
      refreshMeetings()
      return
    }
    if (capture.state) hadCapture.current = true
  }, [capture.state, refreshMeetings])

  /** Fetches authoritative metadata through the existing typed bridge. */
  const sync = async (): Promise<void> => {
    setIsSyncing(true)
    setError(undefined)
    try {
      setItems(await window.whisperer.meetings.sync())
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsSyncing(false)
      setMoreOpen(false)
    }
  }

  /** Imports only user-selected audio and then previews the resulting note. */
  const importAudio = async (): Promise<void> => {
    setError(undefined)
    try {
      const imported = await capture.importAudio()
      if (imported) {
        replaceMeeting(imported)
        setPreviewId(imported.id)
      }
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setMoreOpen(false)
    }
  }

  /** Begins guarded capture after a title is supplied. */
  const startCapture = async (): Promise<void> => {
    if (!captureTitle?.trim()) return
    setError(undefined)
    await capture.start(captureTitle.trim())
    setCaptureTitle(undefined)
  }

  /** Deletes the record after confirmation and returns safely to home selection. */
  const removeMeeting = async (meeting: Meeting): Promise<void> => {
    if (!window.confirm(`Delete “${meeting.title}”?`)) return
    setError(undefined)
    try {
      await deleteMeeting(meeting.id)
      setItems((meetings) => meetings.filter(({ id }) => id !== meeting.id))
      setSelectedId(undefined)
      if (previewId === meeting.id) setPreviewId(undefined)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  /** Persists a metadata-only title rename through the existing revision-safe store. */
  const renameMeeting = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!renameForm?.title.trim()) return
    setIsRenaming(true)
    setError(undefined)
    try {
      const { meeting, title } = renameForm
      replaceMeeting(await saveMeeting({
        id: meeting.id,
        title: title.trim(),
        startedAt: meeting.startedAt,
        endedAt: meeting.endedAt,
        durationMs: meeting.durationMs,
        historyEntryIds: meeting.historyEntryIds,
      }))
      setRenameForm(undefined)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsRenaming(false)
    }
  }

  if (selected) {
    const currentIndex = items.findIndex(({ id }) => id === selected.id)
    return <>
      <MeetingDetail
        key={selected.id}
        captureActive={Boolean(capture.state)}
        meeting={selected}
        previous={currentIndex > 0 ? items[currentIndex - 1] : undefined}
        next={currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : undefined}
        onBack={() => { setPreviewId(selected.id); setSelectedId(undefined) }}
        onDelete={() => void removeMeeting(selected)}
        onExport={() => void capture.exportAudio(selected.id).catch((reason) => setError(errorMessage(reason)))}
        onNavigate={setSelectedId}
        onRename={() => setRenameForm({ meeting: selected, title: selected.title })}
        onStopCapture={() => void capture.stop()}
        onUpdate={replaceMeeting}
      />
      {error ? <p className="ui-alert" role="alert">{error}</p> : null}
      {capture.recordingError ? <p className="ui-alert" role="alert">{capture.recordingError}</p> : null}
      {renameForm ? <RenameMeetingDialog form={renameForm} isSaving={isRenaming} onCancel={() => setRenameForm(undefined)} onChange={(title) => setRenameForm((current) => current ? { ...current, title } : current)} onSubmit={renameMeeting} /> : null}
    </>
  }

  return <main className="page ui-content ui-meetings" aria-label="Notetaker home">
    <header className="ui-content__header ui-notetaker__header">
      <h1>Notetaker</h1>
      <div className="ui-header-actions">
        <div className="ui-menu-wrap">
          <button className="ui-icon-button ui-notetaker-more" type="button" aria-expanded={moreOpen} aria-haspopup="menu" aria-label="More Notetaker actions" onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal aria-hidden="true" size={19} /></button>
          {moreOpen ? <div className="ui-menu" role="menu">
            <button disabled={isSyncing} role="menuitem" type="button" onClick={() => void sync()}><RefreshCw aria-hidden="true" size={15} />{isSyncing ? 'Syncing…' : 'Sync notes'}</button>
            <button role="menuitem" type="button" onClick={() => void importAudio()}><FileAudio aria-hidden="true" size={15} />Import audio</button>
          </div> : null}
        </div>
        <button className="ui-button ui-button--dark" type="button" onClick={() => setCaptureTitle('')}><PlayCircle aria-hidden="true" size={17} />Start Notetaker</button>
      </div>
    </header>

    {error ? <p className="ui-alert" role="alert">{error}</p> : null}
    {capture.recordingError ? <p className="ui-alert" role="alert">{capture.recordingError}</p> : null}

    <div className="ui-notetaker-home">
      <section className="ui-notetaker-list" aria-labelledby="past-notes-title">
        <header className="ui-notetaker-list__header">
          <h2 id="past-notes-title">Past notes</h2>
          <label className="ui-notetaker-search"><Search aria-hidden="true" size={16} /><span className="sr-only">Search notes</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" /></label>
        </header>
        {isLoading ? <p className="ui-status" role="status">Loading notes…</p> : null}
        {loadError ? <ContentError message={loadError} retry={reload} /> : null}
        {!isLoading && !loadError ? <div className="ui-notetaker-list__body">
          {meetingGroups.length ? meetingGroups.map(([label, meetings]) => <section className="ui-notetaker-group" key={label} aria-labelledby={`meeting-group-${label}`}>
            <h3 id={`meeting-group-${label}`}>{label}</h3>
            <ul>{meetings.map((meeting) => <li className={`ui-notetaker-row${preview?.id === meeting.id ? ' is-previewed' : ''}`} key={meeting.id} onMouseEnter={() => setPreviewId(meeting.id)}>
              <button className="ui-notetaker-row__select" type="button" aria-pressed={preview?.id === meeting.id} onFocus={() => setPreviewId(meeting.id)} onClick={() => setPreviewId(meeting.id)}>
                <span className="ui-notetaker-row__icon"><FileAudio aria-hidden="true" size={18} /></span>
                <span><strong className="ui-notetaker-row__title">{meeting.title}</strong><time className="ui-notetaker-row__time" dateTime={meeting.startedAt}>{formatHistoryTime(meeting.startedAt) || 'No start time'}</time></span>
                <span className={`ui-notetaker-row__status${meetingProcessingLabel(meeting).includes('failed') ? ' is-error' : ''}`}>{meetingProcessingLabel(meeting)}</span>
              </button>
              <button className="ui-notetaker-row__open" type="button" onFocus={() => setPreviewId(meeting.id)} onClick={() => setSelectedId(meeting.id)}>Open note</button>
            </li>)}</ul>
          </section>) : <section className="ui-notetaker-empty" aria-label="No notes found"><div><span className="ui-empty__mark"><FileAudio aria-hidden="true" size={22} /></span><h3>{query ? 'No matching notes' : 'No notes yet'}</h3><p>{query ? 'Try a different title or date.' : 'Start Notetaker or import audio to create your first note.'}</p></div></section>}
        </div> : null}
      </section>
      <NotetakerOverview meeting={preview} />
    </div>

    <footer className="ui-notetaker-capture" aria-label="Notetaker capture control">
      <span className={`ui-notetaker-capture__pulse${capture.state ? ' is-active' : ''}`} aria-hidden="true" />
      <div><strong>{capture.state?.title ?? 'Ready to capture'}</strong><span>{capture.state ? (capture.state.status === 'recording' ? `Recording ${formatElapsed(elapsed)}` : 'Finishing recording…') : 'Start a new microphone recording when you are ready.'}</span></div>
      <div className="ui-notetaker-capture__actions">{capture.state ? <button className="ui-button ui-button--dark" type="button" onClick={() => void capture.stop()}><PauseCircle aria-hidden="true" size={17} />Stop</button> : <button className="ui-button ui-button--dark" type="button" onClick={() => setCaptureTitle('')}><PlayCircle aria-hidden="true" size={17} />Start</button>}</div>
    </footer>

    {captureTitle !== undefined ? <CaptureTitleDialog title={captureTitle} onChange={setCaptureTitle} onCancel={() => setCaptureTitle(undefined)} onStart={() => void startCapture()} /> : null}
    {renameForm ? <RenameMeetingDialog form={renameForm} isSaving={isRenaming} onCancel={() => setRenameForm(undefined)} onChange={(title) => setRenameForm((current) => current ? { ...current, title } : current)} onSubmit={renameMeeting} /> : null}
  </main>
}

/** Shows the selected, hovered or keyboard-focused row without navigating away from home. */
function NotetakerOverview({ meeting }: { meeting?: Meeting }): React.JSX.Element {
  const summary = firstSummaryParagraph(meeting?.summary)
  return <aside className="ui-notetaker-overview" aria-live="polite" aria-label="Selected note overview">
    {meeting ? <><header><h2>{meeting.title}</h2><p>{formatDate(meeting.startedAt)} · {formatHistoryTime(meeting.startedAt) || 'No start time'}</p></header><div><span>Overview</span><p>{summary || 'A summary will appear here when it is ready. Open the note to read or edit its available content.'}</p></div></> : <div className="ui-notetaker-overview__empty"><h2>Select a note</h2><p>Its date and available summary will appear here.</p></div>}
  </aside>
}

/** Extracts a compact plain-text preview without treating Markdown or HTML as executable content. */
function firstSummaryParagraph(summary?: string): string | undefined {
  return summary?.split(/\n{2,}/u).map((paragraph) => paragraph.replace(/[#*_>`]/gu, '').trim()).find(Boolean)
}

/** Groups meetings by readable local calendar date while preserving the fetched order. */
function groupMeetings(meetings: Meeting[]): Array<[string, Meeting[]]> {
  const groups = new Map<string, Meeting[]>()
  for (const meeting of meetings) {
    const label = meetingDayLabel(meeting.startedAt)
    groups.set(label, [...(groups.get(label) ?? []), meeting])
  }
  return [...groups]
}

/** Keeps an active capture duration visible without subscribing when idle. */
function useCaptureElapsed(startedAt?: string): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return undefined
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [startedAt])
  const started = startedAt ? new Date(startedAt).getTime() : now
  return Number.isNaN(started) ? 0 : Math.max(0, now - started)
}

/** Formats a live capture duration with a stable two-digit clock. */
function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
