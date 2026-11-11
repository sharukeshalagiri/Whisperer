/* Exported session helpers are deliberately unit-tested beside this component. */
/* eslint-disable react-refresh/only-export-components */
import {
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Maximize2,
  PanelLeft,
  PencilLine,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Note } from '../../../shared/contracts'
import { TextTransformationDialog } from '../../components/TextTransformationDialog'
import {
  closeCurrentWindow,
  copyNoteText,
  deleteNote,
  listNotes,
  maximizeCurrentWindow,
  saveNote,
  summarizeNote,
} from './api'
import { NoteSaveQueue } from './note-save-queue'
import type { NoteDraft } from './note-save-queue'
import { errorMessage } from './use-content-list'

export interface ScratchpadScreenProps {
  /** Optional local note identifier supplied by the renderer route. */
  noteId?: string
}

export interface ScratchpadTab extends NoteDraft {
  id: string
  summary: string | null
  syncState: Note['syncState']
}

type SaveStatus = 'Saved' | 'Saving' | 'Unsaved' | 'Error'
type ScratchpadTextSize = 'small' | 'medium' | 'large'

interface ScratchpadTransformation {
  id: string
  source: string
}

/** Renders a standalone Scratchpad with local session tabs and durable save barriers. */
export function ScratchpadScreen({ noteId }: ScratchpadScreenProps): React.JSX.Element {
  const initialId = useRef(noteId ?? tabsId())
  const [tabs, setTabs] = useState<ScratchpadTab[]>(() => [blankTab(initialId.current)])
  const [selectedId, setSelectedId] = useState(initialId.current)
  const [isLoading, setIsLoading] = useState(Boolean(noteId))
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('Saved')
  const [error, setError] = useState<string>()
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [sidepaneOpen, setSidepaneOpen] = useState(false)
  const [tabSearch, setTabSearch] = useState('')
  const [textSize, setTextSize] = useState<ScratchpadTextSize>('medium')
  const [isTextMenuOpen, setIsTextMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [transformation, setTransformation] = useState<ScratchpadTransformation>()
  const tabsRef = useRef(tabs)
  const selectedIdRef = useRef(selectedId)
  const editorRef = useRef<HTMLDivElement>(null)
  const latestSavedNotes = useRef(new Map<string, Note>())
  const queue = useRef(
    new NoteSaveQueue(async (draft) => {
      const saved = await saveNote(draft)
      latestSavedNotes.current.set(saved.id, saved)
    }),
  )

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    if (!noteId) return
    let mounted = true
    void listNotes()
      .then((notes) => {
        const existing = notes.find((note) => note.id === noteId)
        if (mounted && existing) setTabs([toTab(existing)])
      })
      .catch((reason) => {
        if (mounted) setError(errorMessage(reason))
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [noteId])

  const selectedTab = tabs.find((tab) => tab.id === selectedId) ?? tabs[0]

  useEffect(() => {
    if (!selectedTab || saveStatus !== 'Unsaved') return
    const timer = window.setTimeout(() => {
      void persistTab(selectedTab.id)
    }, 650)
    return () => window.clearTimeout(timer)
    // persistTab's identity changes with render state; draft changes are intentional debounce resets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, saveStatus])

  useEffect(() => {
    const active = getTab(selectedIdRef.current, tabsRef.current)
    if (!active || !editorRef.current) return
    editorRef.current.textContent = active.content
  }, [selectedId, isLoading])

  useEffect(() => {
    const saveBeforeExit = () => {
      const active = getTab(selectedIdRef.current, tabsRef.current)
      if (active) queue.current.schedule(toDraft(active))
    }
    window.addEventListener('pagehide', saveBeforeExit)
    return () => window.removeEventListener('pagehide', saveBeforeExit)
  }, [])

  /** Queues and completes the active draft before any state-changing action proceeds. */
  const persistTab = useCallback(async (tabId: string): Promise<boolean> => {
    const tab = getTab(tabId, tabsRef.current)
    if (!tab) return true
    const draft = toDraft(tab)
    const isActive = selectedIdRef.current === tabId
    if (isActive) setSaveStatus('Saving')
    setError(undefined)
    queue.current.schedule(draft)
    try {
      await queue.current.flush()
      const saved = latestSavedNotes.current.get(tabId)
      setTabs((current) =>
        current.map((candidate) =>
          candidate.id === tabId &&
          candidate.title === draft.title &&
          candidate.content === draft.content &&
          saved
            ? { ...candidate, summary: saved.summary, syncState: saved.syncState }
            : candidate,
        ),
      )
      if (selectedIdRef.current === tabId) setSaveStatus('Saved')
      return true
    } catch (reason) {
      if (selectedIdRef.current === tabId) setSaveStatus('Error')
      setError(errorMessage(reason))
      return false
    }
  }, [])

  /** Updates only the active session draft and prevents completed writes from replacing typing. */
  const updateSelected = useCallback((content: string) => {
    const tabId = selectedIdRef.current
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, content } : tab)))
    setSaveStatus('Unsaved')
    setError(undefined)
  }, [])

  /** Switches tabs after a save barrier so rapid typing cannot be lost. */
  const selectTab = useCallback(
    async (tabId: string) => {
      if (tabId === selectedIdRef.current || isTransitioning) return
      setIsTransitioning(true)
      try {
        if (await persistTab(selectedIdRef.current)) setSelectedId(tabId)
      } finally {
        setIsTransitioning(false)
      }
    },
    [isTransitioning, persistTab],
  )

  /** Creates a session-only tab after safely persisting the current one. */
  const startNew = useCallback(async () => {
    if (isTransitioning) return
    setIsTransitioning(true)
    try {
      if (!(await persistTab(selectedIdRef.current))) return
      const session = addScratchpadTab(tabsRef.current, tabsId())
      setTabs(session.tabs)
      setSelectedId(session.selectedId)
      setSaveStatus('Saved')
      setError(undefined)
    } finally {
      setIsTransitioning(false)
    }
  }, [isTransitioning, persistTab])

  /** Closes one session tab only after its current draft has crossed the save barrier. */
  const closeTab = useCallback(
    async (tabId: string) => {
      if (isTransitioning) return
      setIsTransitioning(true)
      try {
        if (!(await persistTab(tabId))) return
        const current = tabsRef.current
        if (current.length === 1) {
          await closeCurrentWindow()
          return
        }
        const index = current.findIndex((tab) => tab.id === tabId)
        const next = current.filter((tab) => tab.id !== tabId)
        setTabs(next)
        const adjacentTab = next[Math.max(0, index - 1)] ?? next[0]
        if (selectedIdRef.current === tabId && adjacentTab) setSelectedId(adjacentTab.id)
      } finally {
        setIsTransitioning(false)
      }
    },
    [isTransitioning, persistTab],
  )

  /** Persists before closing the native window, retaining every recent editor change. */
  const closeWindow = useCallback(async () => {
    if (isTransitioning) return
    setIsTransitioning(true)
    try {
      if (await persistTab(selectedIdRef.current)) await closeCurrentWindow()
    } finally {
      setIsTransitioning(false)
    }
  }, [isTransitioning, persistTab])

  /** Removes a note only after its queued draft has completed successfully. */
  const removeSelected = useCallback(async () => {
    if (
      !selectedTab ||
      isTransitioning ||
      !window.confirm('Delete this note? This cannot be undone.')
    )
      return
    setIsTransitioning(true)
    try {
      if (!(await persistTab(selectedTab.id))) return
      await deleteNote(selectedTab.id)
      const current = tabsRef.current
      const next = current.filter((tab) => tab.id !== selectedTab.id)
      if (next.length === 0) {
        await closeCurrentWindow()
      } else {
        setTabs(next)
        const nextTab = next[0]
        if (nextTab) setSelectedId(nextTab.id)
        setSaveStatus('Saved')
      }
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsTransitioning(false)
    }
  }, [isTransitioning, persistTab, selectedTab])

  /** Requests a server summary from the per-note overflow menu after the save barrier. */
  const summarize = useCallback(async () => {
    if (!selectedTab || isSummarizing || !(await persistTab(selectedTab.id))) return
    const saved = latestSavedNotes.current.get(selectedTab.id)
    if (!saved || saved.syncState !== 'synced') {
      setError('This note must finish syncing before it can be summarized.')
      return
    }
    setIsSummarizing(true)
    try {
      const summarized = await summarizeNote(saved.id)
      setTabs((current) =>
        current.map((tab) =>
          tab.id === summarized.id
            ? { ...tab, summary: summarized.summary, syncState: summarized.syncState }
            : tab,
        ),
      )
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsSummarizing(false)
    }
  }, [isSummarizing, persistTab, selectedTab])

  /** Copies the actual persisted text through the narrow desktop clipboard bridge. */
  const copy = useCallback(async () => {
    if (!selectedTab) return
    try {
      await copyNoteText(selectedTab.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }, [selectedTab])

  /** Applies a preview only when the note remains exactly as it was when generation began. */
  const applyTransformation = useCallback(async (text: string): Promise<void> => {
    const pending = transformation
    if (!pending) return
    const current = getTab(pending.id, tabsRef.current)
    if (!current || current.content !== pending.source) {
      throw new Error('This note changed while the preview was open. Generate a new preview to keep your latest draft.')
    }
    const updatedTabs = tabsRef.current.map((tab) => tab.id === pending.id ? { ...tab, content: text } : tab)
    tabsRef.current = updatedTabs
    setTabs(updatedTabs)
    if (selectedIdRef.current === pending.id && editorRef.current) editorRef.current.textContent = text
    setSaveStatus('Unsaved')
    setError(undefined)
    await persistTab(pending.id)
  }, [persistTab, transformation])

  const visibleTabs = tabs.filter((tab) =>
    scratchpadTabLabel(tab).toLocaleLowerCase().includes(tabSearch.toLocaleLowerCase()),
  )

  return (
    <main className={`scratchpad-window ${scratchpadTextSizeClass(textSize)}`}>
      <header className="scratchpad-tabs" aria-label="Open notes">
        <div className="scratchpad-tab-strip" role="tablist">
          {tabs.map((tab) => (
            <div
              className={`scratchpad-tab ${tab.id === selectedId ? 'is-active' : ''}`}
              key={tab.id}
              role="presentation"
            >
              <button
                aria-selected={tab.id === selectedId}
                disabled={isTransitioning}
                onClick={() => void selectTab(tab.id)}
                role="tab"
                type="button"
              >
                {scratchpadTabLabel(tab)}
              </button>
              <button
                aria-label={`Close ${scratchpadTabLabel(tab)}`}
                disabled={isTransitioning}
                onClick={() => void closeTab(tab.id)}
                type="button"
              >
                <X aria-hidden="true" size={13} />
              </button>
            </div>
          ))}
          <button
            aria-label="New scratchpad note"
            className="scratchpad-tab-new"
            disabled={isTransitioning}
            onClick={() => void startNew()}
            type="button"
          >
            <span>+</span>
          </button>
        </div>
        <div className="scratchpad-window-actions">
          <button
            aria-label="Expand scratchpad"
            onClick={() => void maximizeCurrentWindow()}
            type="button"
          >
            <Maximize2 aria-hidden="true" size={15} />
          </button>
          <button aria-label="Close scratchpad" onClick={() => void closeWindow()} type="button">
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      </header>
      <div className={`scratchpad-body ${sidepaneOpen ? 'has-sidepane' : ''}`}>
        <aside className="scratchpad-rail" aria-label="Scratchpad tools">
          <button
            aria-pressed={sidepaneOpen}
            aria-label="Toggle notes side pane"
            onClick={() => setSidepaneOpen((open) => !open)}
            type="button"
          >
            <PanelLeft aria-hidden="true" size={17} />
          </button>
          <button
            aria-label="New scratchpad note"
            disabled={isTransitioning}
            onClick={() => void startNew()}
            type="button"
          >
            <PencilLine aria-hidden="true" size={17} />
          </button>
          <button
            aria-label="Search open note tabs"
            onClick={() => setSidepaneOpen(true)}
            type="button"
          >
            <Search aria-hidden="true" size={17} />
          </button>
          <div className="scratchpad-text-control">
            <button
              aria-expanded={isTextMenuOpen}
              aria-label="Text appearance"
              className="scratchpad-text-button"
              onClick={() => setIsTextMenuOpen((open) => !open)}
              type="button"
            >
              <span aria-hidden="true">Aa</span>
            </button>
            {isTextMenuOpen ? (
              <div
                aria-label="Text appearance options"
                className="scratchpad-text-menu"
                role="menu"
              >
                <span>Text size</span>
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button
                    aria-checked={textSize === size}
                    key={size}
                    onClick={() => {
                      setTextSize(size)
                      setIsTextMenuOpen(false)
                    }}
                    role="menuitemradio"
                    type="button"
                  >
                    {size.charAt(0).toLocaleUpperCase()}
                    {size.slice(1)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
        {sidepaneOpen ? (
          <aside className="scratchpad-sidepane" aria-label="Open note tabs">
            <label>
              <Search aria-hidden="true" size={14} />
              <span className="sr-only">Search open notes</span>
              <input
                autoFocus
                onChange={(event) => setTabSearch(event.target.value)}
                placeholder="Search tabs"
                value={tabSearch}
              />
            </label>
            {visibleTabs.map((tab) => (
              <button
                className={tab.id === selectedId ? 'is-active' : ''}
                key={tab.id}
                onClick={() => void selectTab(tab.id)}
                type="button"
              >
                {scratchpadTabLabel(tab)}
              </button>
            ))}
          </aside>
        ) : null}
        <section className="scratchpad-editor" aria-label="Scratchpad note">
          <div className="scratchpad-editor-status">
            <span
              className={`save-status save-status-${saveStatus.toLocaleLowerCase()}`}
              role="status"
            >
              {isLoading ? 'Loading…' : saveStatus === 'Error' ? 'Not saved' : saveStatus}
            </span>
            <details className="scratchpad-editor-menu">
              <summary aria-label="Note actions">
                <ChevronDown aria-hidden="true" size={15} />
              </summary>
              <div>
                <button
                  disabled={isSummarizing || isLoading}
                  onClick={() => void summarize()}
                  type="button"
                >
                  {isSummarizing ? 'Summarizing…' : 'Summarize'}
                </button>
                {selectedTab?.summary ? (
                  <span>
                    <Check aria-hidden="true" size={13} /> Summary ready
                  </span>
                ) : null}
              </div>
            </details>
          </div>
          {error ? (
            <p className="scratchpad-error" role="alert">
              {error}
            </p>
          ) : null}
          <div
            aria-label="Note content"
            className="scratchpad-content"
            contentEditable={!isLoading && !isTransitioning}
            onInput={(event) => updateSelected(event.currentTarget.innerText)}
            ref={editorRef}
            role="textbox"
            spellCheck
            suppressContentEditableWarning
            aria-multiline="true"
          />
          <footer className="scratchpad-footer-actions">
            <button
              aria-label="Version history is unavailable until desktop storage supports it"
              disabled
              title="Version history is not yet available"
            >
              <Clock3 aria-hidden="true" size={17} />
            </button>
            <button
              aria-label="Delete note"
              disabled={isTransitioning}
              onClick={() => void removeSelected()}
              type="button"
            >
              <Trash2 aria-hidden="true" size={17} />
            </button>
            <button
              aria-label="Transform note text"
              disabled={!selectedTab?.content || isTransitioning}
              onClick={() => selectedTab && setTransformation({ id: selectedTab.id, source: selectedTab.content })}
              type="button"
            >
              ✦
            </button>
            <button
              className="scratchpad-copy-button"
              disabled={!selectedTab?.content}
              onClick={() => void copy()}
              type="button"
            >
              <Copy aria-hidden="true" size={16} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </footer>
        </section>
      </div>
      {transformation ? <TextTransformationDialog sourceText={transformation.source} onClose={() => setTransformation(undefined)} onGenerate={(request: import('../../components/TextTransformationDialog').TransformationRequest) => window.whisperer.transformations.preview(request)} onCopy={(text) => window.whisperer.clipboard.copy(text)} onApply={applyTransformation} /> : null}
    </main>
  )
}

/** Adds a blank tab to a local standalone window session. */
export function addScratchpadTab(
  tabs: ScratchpadTab[],
  id: string,
): { tabs: ScratchpadTab[]; selectedId: string } {
  return { tabs: [...tabs, blankTab(id)], selectedId: id }
}

/** Names tabs using the original concise untitled convention. */
export function scratchpadTabLabel(tab: Pick<ScratchpadTab, 'title'>): string {
  return tab.title.trim() || 'Untitled'
}

/** Returns the local-only CSS modifier for the chosen plain-text editor appearance. */
export function scratchpadTextSizeClass(size: ScratchpadTextSize): string {
  return `scratchpad-window--text-${size}`
}

/** Creates one valid string-content note without assuming any unsupported rich-text wire format. */
function blankTab(id = tabsId()): ScratchpadTab {
  return { id, title: '', content: '', summary: null, syncState: 'local' }
}

/** Converts server note data into the minimal view state owned by the standalone editor. */
function toTab(note: Note): ScratchpadTab {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    summary: note.summary,
    syncState: note.syncState,
  }
}

/** Builds the persistence payload accepted by the existing string-content note API. */
function toDraft(tab: ScratchpadTab): NoteDraft {
  return { id: tab.id, title: tab.title, content: tab.content }
}

/** Finds an active session tab without fabricating fallback content. */
function getTab(id: string, tabs: ScratchpadTab[]): ScratchpadTab | undefined {
  return tabs.find((tab) => tab.id === id)
}

/** Produces a stable ID for a client-created tab before its first durable save. */
function tabsId(): string {
  return crypto.randomUUID()
}
