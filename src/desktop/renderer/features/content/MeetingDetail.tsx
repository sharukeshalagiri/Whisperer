import { ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Clock3, Copy, Ellipsis, FileAudio, Pencil, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'

import { TextTransformationDialog } from '../../components/TextTransformationDialog'
import type { MeetingQuestionAnswer } from '../../../shared/contracts'
import type { Meeting } from './api'
import { formatDate, formatDuration } from './format'
import {
  applyIncomingMeeting,
  discardMeetingDraft,
  type MeetingDetailTab,
  type MeetingDraftRevisions,
  meetingHasDirtyDraft,
  meetingQuestionResponseMatches,
  meetingIsProcessing,
  meetingProcessingLabel,
  moveMeetingDetailTab,
} from './meeting-detail-state'
import { errorMessage } from './use-content-list'

type MeetingTextField = MeetingDetailTab

type DetailAction = 'retry' | 'regenerate' | 'resume'

/** The maximum number of five-second server checks before showing manual recovery. */
const MAX_PROCESSING_REFRESHES = 12

/** Supplies the parent-owned navigation and mutation actions for one open workspace. */
export interface MeetingDetailProps {
  /** Meeting selected for full workspace navigation. */
  meeting: Meeting
  /** Whether a different meeting is actively recording. */
  captureActive: boolean
  /** Adjacent meeting in list order, when one exists. */
  previous?: Meeting
  /** Adjacent meeting in list order, when one exists. */
  next?: Meeting
  /** Returns to the home list and its preview selection. */
  onBack: () => void
  /** Opens a neighboring workspace. */
  onNavigate: (id: string) => void
  /** Opens the parent rename dialog. */
  onRename: () => void
  /** Requests permanent deletion through the parent. */
  onDelete: () => void
  /** Opens native audio export through the capture owner. */
  onExport: () => void
  /** Stops the active microphone capture through its sole owner. */
  onStopCapture: () => void
  /** Replaces this meeting in the parent cache. */
  onUpdate: (meeting: Meeting) => void
}

/** Renders one full-screen, revision-safe meeting reading and editing workspace. */
export function MeetingDetail({
  captureActive,
  meeting,
  next,
  onBack,
  onDelete,
  onExport,
  onNavigate,
  onRename,
  onStopCapture,
  onUpdate,
  previous,
}: MeetingDetailProps): React.JSX.Element {
  const [current, setCurrent] = useState(meeting)
  const [transcript, setTranscript] = useState(meeting.transcript ?? '')
  const [summary, setSummary] = useState(meeting.summary ?? '')
  const [dirty, setDirty] = useState<Record<MeetingTextField, boolean>>({ transcript: false, summary: false })
  const [activeTab, setActiveTab] = useState<MeetingDetailTab>('transcript')
  const [editing, setEditing] = useState<MeetingTextField>()
  const [saving, setSaving] = useState<MeetingTextField>()
  const [busy, setBusy] = useState<DetailAction>()
  const [error, setError] = useState<string>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [transform, setTransform] = useState<{ field: MeetingTextField; text: string }>()
  const [pollingExhausted, setPollingExhausted] = useState(false)
  const [pollingRestart, setPollingRestart] = useState(0)
  const [serverChanged, setServerChanged] = useState<Record<MeetingTextField, boolean>>({ transcript: false, summary: false })
  const currentRef = useRef(meeting)
  const dirtyRef = useRef(dirty)
  const revisionsRef = useRef<MeetingDraftRevisions>({ transcript: meeting.transcriptRevision, summary: meeting.summaryRevision })
  const transcriptRef = useRef(transcript)
  const summaryRef = useRef(summary)
  const mounted = useRef(true)
  const captureWasActive = useRef(captureActive)
  const pollingAttempts = useRef(0)
  const isProcessing = meetingIsProcessing(current)

  /** Changes local dirtiness in state and in the refresh guard together. */
  const setFieldDirty = useCallback((field: MeetingTextField, value: boolean): void => {
    const next = { ...dirtyRef.current, [field]: value }
    dirtyRef.current = next
    setDirty(next)
  }, [])

  /** Restarts bounded polling only after an explicit recovery action. */
  const restartPolling = useCallback((): void => {
    pollingAttempts.current = 0
    setPollingExhausted(false)
    setPollingRestart((value) => value + 1)
  }, [])

  useEffect(() => { dirtyRef.current = dirty }, [dirty])
  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { summaryRef.current = summary }, [summary])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  /** Adopts server revisions while retaining drafts and their original save bases. */
  const applyIncoming = useCallback((incoming: Meeting): void => {
    if (!mounted.current) return
    const applied = applyIncomingMeeting(currentRef.current, incoming, {
      transcript: transcriptRef.current,
      summary: summaryRef.current,
    }, dirtyRef.current, revisionsRef.current)
    currentRef.current = applied.meeting
    revisionsRef.current = applied.revisions
    setCurrent(applied.meeting)
    setServerChanged(applied.serverChanged)
    onUpdate(applied.meeting)
    setTranscript(applied.transcript)
    setSummary(applied.summary)
  }, [onUpdate])

  /** Refreshes the record without changing the currently selected workspace. */
  const refresh = useCallback(async (): Promise<void> => {
    const fresh = await window.whisperer.meetings.get(meeting.id)
    if (fresh) applyIncoming(fresh)
  }, [applyIncoming, meeting.id])

  useEffect(() => { void refresh().catch(() => undefined) }, [meeting.id, refresh])
  useEffect(() => {
    if (meeting.id === currentRef.current.id && meeting.revision !== currentRef.current.revision) applyIncoming(meeting)
  }, [applyIncoming, meeting])
  useEffect(() => {
    if (!captureActive && captureWasActive.current) {
      restartPolling()
      void refresh().catch(() => undefined)
    }
    captureWasActive.current = captureActive
  }, [captureActive, refresh, restartPolling])
  useEffect(() => {
    if (!isProcessing) {
      pollingAttempts.current = 0
      setPollingExhausted(false)
      return undefined
    }
    const interval = window.setInterval(() => {
      if (pollingAttempts.current >= MAX_PROCESSING_REFRESHES) {
        window.clearInterval(interval)
        if (mounted.current) setPollingExhausted(true)
        return
      }
      pollingAttempts.current += 1
      void refresh().catch(() => undefined)
    }, 5_000)
    return () => window.clearInterval(interval)
  }, [isProcessing, pollingRestart, refresh])

  /** Saves one explicit user edit against the revision from which that draft began. */
  const save = async (field: MeetingTextField): Promise<void> => {
    const revision = revisionsRef.current[field]
    if (revision === undefined) {
      setError(`This ${field} is not ready to save yet.`)
      return
    }
    const record = currentRef.current
    const text = field === 'transcript' ? transcriptRef.current : summaryRef.current
    setSaving(field)
    setError(undefined)
    try {
      const saved = field === 'transcript'
        ? await window.whisperer.meetings.saveTranscript({ id: record.id, text, revision })
        : await window.whisperer.meetings.saveSummary({ id: record.id, text, revision })
      currentRef.current = saved
      revisionsRef.current = {
        ...revisionsRef.current,
        [field]: field === 'transcript' ? saved.transcriptRevision : saved.summaryRevision,
      }
      setCurrent(saved)
      setServerChanged((value) => ({ ...value, [field]: false }))
      onUpdate(saved)
      setFieldDirty(field, false)
      setEditing(undefined)
    } catch (reason) {
      setError(`${errorMessage(reason)} Your unsaved edits are still here. Refresh the meeting to review the newer version before resolving the conflict.`)
    } finally {
      if (mounted.current) setSaving(undefined)
    }
  }

  /** Invokes a real meeting lifecycle action and retains existing visible text. */
  const action = async (kind: DetailAction): Promise<void> => {
    setBusy(kind)
    setError(undefined)
    try {
      const updated = kind === 'retry'
        ? await window.whisperer.meetings.retry(currentRef.current.id)
        : kind === 'regenerate'
          ? await window.whisperer.meetings.regenerateSummary(currentRef.current.id)
          : await window.whisperer.meetings.resume(currentRef.current.id)
      if ('transcriptStatus' in updated) {
        applyIncoming(updated)
        restartPolling()
      } else if (kind === 'resume') {
        restartPolling()
      }
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      if (mounted.current) setBusy(undefined)
    }
  }

  /** Discards an edit and restores the most recent server version for that field. */
  const discardDraft = (field: MeetingTextField): void => {
    const discarded = discardMeetingDraft(currentRef.current, {
      transcript: transcriptRef.current,
      summary: summaryRef.current,
    }, revisionsRef.current, field)
    revisionsRef.current = discarded.revisions
    if (field === 'transcript') {
      transcriptRef.current = discarded.draft.transcript
      setTranscript(discarded.draft.transcript)
    } else {
      summaryRef.current = discarded.draft.summary
      setSummary(discarded.draft.summary)
    }
    setFieldDirty(field, false)
    setServerChanged((value) => ({ ...value, [field]: false }))
    setEditing(undefined)
  }

  /** Applies a transformation only when the source draft is still exact. */
  const applyTransformation = (text: string): void => {
    if (!transform) return
    const source = transform.field === 'transcript' ? transcriptRef.current : summaryRef.current
    if (source !== transform.text) throw new Error('This field changed while the preview was open. Generate a new preview to keep your edits.')
    if (transform.field === 'transcript') {
      transcriptRef.current = text
      setTranscript(text)
    } else {
      summaryRef.current = text
      setSummary(text)
    }
    setFieldDirty(transform.field, true)
  }

  /** Requires confirmation before a navigation action destroys either local text draft. */
  const confirmDiscardAndRun = useCallback((operation: () => void): void => {
    if (!meetingHasDirtyDraft(dirtyRef.current) || window.confirm('Discard unsaved transcript or summary changes?')) operation()
  }, [])

  /** Copies current text through the narrow desktop clipboard bridge. */
  const copyText = (text: string): void => {
    void window.whisperer.clipboard.copy(text).catch((reason) => setError(errorMessage(reason)))
  }

  /** Moves focus and selection through the two supported content tabs. */
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: MeetingDetailTab): void => {
    const destination = moveMeetingDetailTab(tab, event.key)
    if (destination === tab) return
    event.preventDefault()
    setActiveTab(destination)
    window.requestAnimationFrame(() => document.getElementById(`meeting-${destination}-tab`)?.focus())
  }

  const metadata = [formatDate(current.startedAt), formatDuration(current.durationMs)].filter(Boolean).join(' · ')
  const stage = meetingProcessingLabel(current)
  const isFailure = current.syncState === 'error' || current.transcriptStatus === 'failed' || current.summaryStatus === 'failed'
  const activeText = activeTab === 'transcript' ? transcript : summary
  const activeStatus = activeTab === 'transcript' ? current.transcriptStatus : current.summaryStatus

  return <main className="ui-content ui-meeting-workspace" aria-label="Meeting workspace">
    <header className="ui-meeting-workspace__toolbar">
      <button className="ui-icon-button ui-meeting-workspace__back" type="button" aria-label="Back to past notes" onClick={() => confirmDiscardAndRun(onBack)}><ArrowLeft aria-hidden="true" size={19} /></button>
      <div className="ui-meeting-workspace__toolbar-actions">
        <div className="ui-menu-wrap">
          <button className="ui-icon-button" type="button" aria-expanded={menuOpen} aria-haspopup="menu" aria-label="Meeting actions" onClick={() => setMenuOpen((value) => !value)}><Ellipsis aria-hidden="true" size={19} /></button>
          {menuOpen ? <div className="ui-menu ui-meeting-menu" role="menu">
            <button disabled={busy !== undefined || current.transcriptStatus === 'pending' || current.transcriptStatus === 'running'} role="menuitem" type="button" onClick={() => { setMenuOpen(false); void action('regenerate') }}><Sparkles aria-hidden="true" size={15} />Regenerate summary</button>
            {isFailure ? <button disabled={busy !== undefined} role="menuitem" type="button" onClick={() => { setMenuOpen(false); void action('retry') }}><RefreshCw aria-hidden="true" size={15} />Retry processing</button> : null}
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onRename() }}><Pencil aria-hidden="true" size={15} />Rename</button>
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); confirmDiscardAndRun(onDelete) }}><Trash2 aria-hidden="true" size={15} />Delete</button>
          </div> : null}
        </div>
        <button className="ui-icon-button" type="button" disabled={!previous} aria-label="Previous note" onClick={() => previous && confirmDiscardAndRun(() => onNavigate(previous.id))}><ChevronLeft aria-hidden="true" size={20} /></button>
        <button className="ui-icon-button" type="button" disabled={!next} aria-label="Next note" onClick={() => next && confirmDiscardAndRun(() => onNavigate(next.id))}><ChevronRight aria-hidden="true" size={20} /></button>
      </div>
    </header>

    <section className="ui-meeting-workspace__heading" aria-labelledby="meeting-workspace-title">
      <h1 id="meeting-workspace-title">{current.title}</h1>
      <div><span className="ui-date-chip">{metadata || 'No date available'}</span><span className={`ui-meeting-stage${isFailure ? ' is-error' : ''}`} role="status">{stage}</span></div>
    </section>

    {error ? <p className="ui-alert" role="alert">{error}</p> : null}
    {pollingExhausted ? <p className="ui-meeting-recovery" role="status">Updates are taking longer than expected. Existing content is still available. <button type="button" onClick={() => { restartPolling(); void refresh().catch((reason) => setError(errorMessage(reason))) }}><RefreshCw aria-hidden="true" size={14} />Refresh now</button></p> : null}

    <div className="ui-meeting-tabs" role="tablist" aria-label="Meeting content">
      <button id="meeting-transcript-tab" role="tab" type="button" aria-controls="meeting-transcript-panel" aria-selected={activeTab === 'transcript'} className={activeTab === 'transcript' ? 'is-active' : ''} onClick={() => setActiveTab('transcript')} onKeyDown={(event) => onTabKeyDown(event, 'transcript')}>Transcript</button>
      <button id="meeting-summary-tab" role="tab" type="button" aria-controls="meeting-summary-panel" aria-selected={activeTab === 'summary'} className={activeTab === 'summary' ? 'is-active' : ''} onClick={() => setActiveTab('summary')} onKeyDown={(event) => onTabKeyDown(event, 'summary')}>Summary{current.summaryStale ? <span className="ui-tab-notice">Out of date</span> : null}</button>
    </div>

    <section className="ui-meeting-reading" id={`meeting-${activeTab}-panel`} role="tabpanel" aria-labelledby={`meeting-${activeTab}-tab`} tabIndex={0}>
      <MeetingTextSurface
        field={activeTab}
        duration={formatDuration(current.durationMs) ?? 'No duration'}
        status={activeStatus}
        text={activeText}
        editing={editing === activeTab}
        saving={saving === activeTab}
        stale={activeTab === 'summary' && Boolean(current.summaryStale)}
        concurrentChange={serverChanged[activeTab]}
        pollingExhausted={pollingExhausted}
        onChange={(text) => {
          if (activeTab === 'transcript') { transcriptRef.current = text; setTranscript(text) } else { summaryRef.current = text; setSummary(text) }
          setFieldDirty(activeTab, true)
        }}
        onEdit={() => setEditing(activeTab)}
        onCancel={() => discardDraft(activeTab)}
        onCopy={copyText}
        onSave={() => void save(activeTab)}
        onTransform={(text) => setTransform({ field: activeTab, text })}
      />
    </section>

    <details className="ui-meeting-audio-details">
      <summary><FileAudio aria-hidden="true" size={16} />Recording and audio</summary>
      {current.hasAudio ? <div><audio className="ui-meeting-audio" controls preload="metadata" src={`whisperer://local/meeting-audio/${encodeURIComponent(current.id)}`}>Your desktop cannot play this local recording.</audio><button className="ui-button" type="button" onClick={onExport}>Export audio</button></div> : <p>No local audio is attached to this meeting.</p>}
    </details>

    <footer className="ui-meeting-workspace__footer">
      {captureActive
        ? <button className="ui-meeting-capture-button" type="button" onClick={onStopCapture}><X aria-hidden="true" size={15} />Stop</button>
        : <button className="ui-meeting-capture-button" disabled={busy !== undefined} onClick={() => void action('resume')} type="button">{busy === 'resume' ? 'Resuming…' : 'Resume'}</button>}
      <MeetingQuestionPanel dirty={meetingHasDirtyDraft(dirty)} meeting={current} />
    </footer>

    {transform ? <TextTransformationDialog sourceText={transform.text} onClose={() => setTransform(undefined)} onGenerate={(request: import('../../components/TextTransformationDialog').TransformationRequest) => window.whisperer.transformations.preview(request)} onCopy={(text) => window.whisperer.clipboard.copy(text)} onApply={applyTransformation} /> : null}
  </main>
}

/** Renders one ephemeral saved-meeting question without retaining chat history. */
export function MeetingQuestionPanel({ dirty, meeting }: { dirty: boolean; meeting: Meeting }): React.JSX.Element {
  const [answer, setAnswer] = useState<MeetingQuestionAnswer>()
  const [answerQuestion, setAnswerQuestion] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [question, setQuestion] = useState('')
  const mounted = useRef(true)
  const requestCounter = useRef(0)
  const submittedQuestion = useRef('')
  const identity = useRef({ meetingId: meeting.id, requestId: 0 })
  useEffect(() => { identity.current = { meetingId: meeting.id, requestId: ++requestCounter.current }; setAnswer(undefined); setAnswerQuestion(''); setError(undefined); setPending(false); setQuestion('') }, [meeting.id])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const submit = async (submitted = question.trim()): Promise<void> => {
    const text = submitted.trim()
    if (pending || !text) return
    if (dirty) { setError('Save transcript or summary edits before asking. Questions use saved content only.'); return }
    if (meeting.transcriptStatus !== 'complete') { setError('Wait for transcript processing to finish before asking a question.'); return }
    if (!(meeting.transcript ?? '').trim()) { setError('Save a transcript before asking a question.'); return }
    submittedQuestion.current = text
    const request = { meetingId: meeting.id, requestId: ++requestCounter.current }
    identity.current = request; setAnswer(undefined); setAnswerQuestion(''); setError(undefined); setPending(true)
    try {
      const result = await window.whisperer.meetings.ask({ id: meeting.id, question: text, transcriptRevision: meeting.transcriptRevision, summaryRevision: meeting.summaryRevision })
      if (mounted.current && meetingQuestionResponseMatches(request, identity.current)) { setAnswerQuestion(text); setAnswer(result) }
    } catch (reason) {
      if (mounted.current && meetingQuestionResponseMatches(request, identity.current)) setError(errorMessage(reason))
    } finally {
      if (mounted.current && meetingQuestionResponseMatches(request, identity.current)) setPending(false)
    }
  }
  return <div className="ui-meeting-question" aria-busy={pending}>
    {answer || error ? <section className="ui-meeting-question__result" aria-live="polite">
      <button aria-label="Dismiss answer" className="ui-meeting-question__dismiss" type="button" onClick={() => { setAnswer(undefined); setAnswerQuestion(''); setError(undefined) }}><X aria-hidden="true" size={14} /></button>
      {answer ? <><p className="ui-meeting-question__question">{answerQuestion}</p><SafeMeetingMarkdown text={answer.answer} /><small>Based on saved transcript revision {answer.transcriptRevision} and {answer.usedSummary ? `summary revision ${answer.summaryRevision}` : 'no saved summary'}{answer.summaryStale ? '; the summary was out of date.' : '.'}</small></> : null}
      {error ? <p className="ui-meeting-question__error" role="alert">{error} <button type="button" disabled={pending || !submittedQuestion.current} onClick={() => void submit(submittedQuestion.current)}>Retry</button></p> : null}
    </section> : null}
    <form className="ui-meeting-question__form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <textarea aria-label="Ask about this meeting" onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (!event.nativeEvent.isComposing && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} placeholder={dirty ? 'Save edits before asking' : meeting.transcriptStatus !== 'complete' ? 'Transcript is still preparing' : 'Ask anything'} rows={1} value={question} />
      <button aria-label="Ask question" disabled={pending || !question.trim() || dirty || meeting.transcriptStatus !== 'complete'} type="submit">{pending ? <span className="ui-meeting-question__loading" aria-hidden="true" /> : <ArrowUp aria-hidden="true" size={16} />}</button>
    </form>
  </div>
}

/** Renders one readable text tab, entering an editor only after an explicit action. */
export function MeetingTextSurface({
  concurrentChange,
  duration,
  editing,
  field,
  onCancel,
  onChange,
  onCopy,
  onEdit,
  onSave,
  onTransform,
  pollingExhausted,
  saving,
  stale,
  status,
  text,
}: {
  concurrentChange: boolean
  duration: string
  editing: boolean
  field: MeetingTextField
  onCancel: () => void
  onChange: (text: string) => void
  onCopy: (text: string) => void
  onEdit: () => void
  onSave: () => void
  onTransform: (text: string) => void
  pollingExhausted: boolean
  saving: boolean
  stale: boolean
  status?: Meeting['transcriptStatus']
  text: string
}): React.JSX.Element {
  const preparing = status === 'pending' || status === 'running'
  const label = field === 'transcript' ? 'Transcript' : 'Summary'
  const metadata = field === 'transcript' ? duration : `${estimateReadTime(text)} read`
  if (preparing && !text) return <MeetingLoadingState exhausted={pollingExhausted} label={`${label} is being prepared`} />
  if (editing) return <div className="ui-meeting-editor"><header><strong>Editing {label.toLocaleLowerCase()}</strong>{concurrentChange ? <span role="status">A newer version exists. Saving this draft will ask you to resolve the conflict.</span> : stale ? <span>Saving will preserve this reviewed draft.</span> : null}</header><textarea aria-label={`${label} text`} disabled={saving} value={text} onChange={(event) => onChange(event.target.value)} placeholder={`No ${label.toLocaleLowerCase()} is available.`} /><footer><button className="ui-button" type="button" disabled={saving || !text.trim()} onClick={() => onTransform(text)}>Transform</button><button className="ui-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="ui-button ui-button--dark" type="button" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save changes'}</button></footer></div>
  return <div className="ui-meeting-document">
    <header><div className="ui-meeting-document__meta">{field === 'transcript' ? <Clock3 aria-hidden="true" size={15} /> : <Sparkles aria-hidden="true" size={15} />}<span>{metadata}</span>{concurrentChange ? <em>Newer version available</em> : preparing ? <em>{label} is still being updated</em> : stale ? <em>Generated from an earlier transcript</em> : null}</div><div className="ui-meeting-document__actions"><button className="ui-icon-button" type="button" disabled={!text.trim()} aria-label={`Copy ${label.toLocaleLowerCase()}`} onClick={() => onCopy(text)}><Copy aria-hidden="true" size={16} /></button><button className="ui-button" type="button" disabled={preparing} onClick={onEdit}><Pencil aria-hidden="true" size={15} />Edit</button></div></header>
    {field === 'transcript' ? <FlatTranscript text={text} /> : <SafeMeetingMarkdown text={text} />}
  </div>
}

/** Displays the flat transcript contract as paragraph bubbles without invented speakers. */
function FlatTranscript({ text }: { text: string }): React.JSX.Element {
  const paragraphs = text.split(/\n{2,}/u).map((paragraph) => paragraph.trim()).filter(Boolean)
  return paragraphs.length ? <div className="ui-flat-transcript">{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 32)}`}>{paragraph}</p>)}</div> : <p className="ui-meeting-empty-text">No transcript is available yet.</p>
}

/** Renders server-provided Markdown without raw HTML, navigation, or remote resources. */
export function SafeMeetingMarkdown({ text }: { text: string }): React.JSX.Element {
  return text.trim() ? <div className="ui-meeting-markdown"><ReactMarkdown skipHtml components={{ a: ({ children }) => <>{children}</>, img: () => null }}>{text}</ReactMarkdown></div> : <p className="ui-meeting-empty-text">No summary is available yet.</p>
}

/** Provides an honest standalone loading pattern while no readable content exists. */
function MeetingLoadingState({ exhausted, label }: { exhausted: boolean; label: string }): React.JSX.Element {
  return <div className={`ui-meeting-loading${exhausted ? ' ui-meeting-loading--expired' : ''}`} role="status">{exhausted ? null : <span aria-hidden="true"><i /><i /><i /></span>}<strong>{exhausted ? 'Preparation is still incomplete' : label}</strong><p>{exhausted ? 'Use Refresh now above to check again or retry processing when it is available.' : 'Keep this window open, or use Refresh now if the update does not complete.'}</p></div>
}

/** Estimates readable summary time without asserting a speaker count or model confidence. */
function estimateReadTime(text: string): string {
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0
  return `${Math.max(1, Math.ceil(words / 200))} min`
}

/** Collects a title before requesting real local microphone capture. */
export function CaptureTitleDialog({ title, onChange, onCancel, onStart }: { title: string; onChange: (title: string) => void; onCancel: () => void; onStart: () => void }): React.JSX.Element {
  return <div className="ui-modal-backdrop" role="presentation"><form className="ui-dialog" aria-labelledby="capture-title-dialog" aria-modal="true" role="dialog" onSubmit={(event) => { event.preventDefault(); onStart() }}><header className="ui-dialog__header"><div><h2 id="capture-title-dialog">Start Notetaker</h2><p>Record microphone audio for this meeting.</p></div><button className="ui-icon-button" type="button" aria-label="Close" onClick={onCancel}><X aria-hidden="true" size={18} /></button></header><label htmlFor="capture-title">Meeting title</label><input autoFocus id="capture-title" value={title} placeholder="Untitled meeting" onChange={(event) => onChange(event.target.value)} /><footer className="ui-dialog__actions"><button className="ui-button" type="button" onClick={onCancel}>Cancel</button><button className="ui-button ui-button--dark" type="submit" disabled={!title.trim()}>Start recording</button></footer></form></div>
}

/** Edits a persisted meeting name without offering an unsupported metadata-only note. */
export function RenameMeetingDialog({ form, isSaving, onCancel, onChange, onSubmit }: { form: { meeting: Meeting; title: string }; isSaving: boolean; onCancel: () => void; onChange: (title: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }): React.JSX.Element {
  return <div className="ui-modal-backdrop" role="presentation"><form className="ui-dialog" aria-labelledby="rename-meeting-dialog" aria-modal="true" role="dialog" onSubmit={(event) => void onSubmit(event)}><header className="ui-dialog__header"><div><h2 id="rename-meeting-dialog">Rename note</h2></div><button className="ui-icon-button" type="button" aria-label="Close" onClick={onCancel}><X aria-hidden="true" size={18} /></button></header><label htmlFor="rename-meeting-title">Meeting title</label><input autoFocus id="rename-meeting-title" value={form.title} onChange={(event) => onChange(event.target.value)} /><footer className="ui-dialog__actions"><button className="ui-button" type="button" onClick={onCancel}>Cancel</button><button className="ui-button ui-button--dark" type="submit" disabled={isSaving || !form.title.trim()}>{isSaving ? 'Saving…' : 'Save'}</button></footer></form></div>
}
