import { useEffect, useRef, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'

import type { BootstrapState, TransformDefinition, TransformDefinitionSaveInput } from '../../../shared/contracts'
import { Dialog } from '../../components/Dialog'
import { ShortcutChips, ShortcutRecorder } from './ShortcutRecorder'
import { TransformSaveQueue } from './transform-save-queue'

interface Draft extends TransformDefinitionSaveInput { key: string }

function complete(draft: Draft | null): draft is Draft {
  return Boolean(draft?.name.trim() && draft.prompt.trim() && draft.shortcut.trim())
}

/** Manages local transform prompts, native shortcuts, and review-first selected-text actions. */
export function TransformsScreen({ state, onRefresh }: { state: BootstrapState; onRefresh: () => Promise<void> }): React.JSX.Element {
  const [definitions, setDefinitions] = useState<TransformDefinition[]>([])
  const [editing, setEditing] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const editingRef = useRef<Draft | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = useRef<TransformSaveQueue<Draft> | null>(null)

  if (!queue.current) {
    queue.current = new TransformSaveQueue(async (draft) => {
      const saved = await window.whisperer.transformations.save({ id: draft.id, name: draft.name, prompt: draft.prompt, shortcut: draft.shortcut })
      setDefinitions((items) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [...items, saved])
      return { ...draft, id: saved.id }
    })
  }

  const load = async (): Promise<void> => {
    try { setDefinitions(await window.whisperer.transformations.list()); setError(undefined) }
    catch { setError('Transforms could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (complete(editingRef.current)) void queue.current?.flush()
  }, [])

  const flush = async (): Promise<boolean> => {
    if (!complete(editingRef.current)) return true
    setSaveState('saving')
    try {
      await queue.current?.flush()
      const savedDraft = queue.current?.current() ?? null
      if (savedDraft?.key === editingRef.current?.key) {
        editingRef.current = savedDraft
        setEditing(savedDraft)
      }
      setSaveState('saved')
      window.setTimeout(() => setSaveState((current) => current === 'saved' ? 'idle' : current), 3000)
      setError(undefined)
      await onRefresh()
      return true
    } catch (reason) {
      setSaveState('error')
      setError(reason instanceof Error ? reason.message : 'This transform could not be saved.')
      return false
    }
  }

  const scheduleSave = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, 2000)
  }
  const openEditor = (draft: Draft): void => {
    if (timer.current) clearTimeout(timer.current)
    editingRef.current = draft
    queue.current?.hydrate(draft)
    setSaveState('idle')
    setEditing(draft)
  }
  const updateDraft = (patch: Partial<Draft>): void => {
    const current = editingRef.current
    if (!current) return
    const next = { ...current, ...patch }
    editingRef.current = next
    queue.current?.replace(next)
    setSaveState('idle')
    setEditing(next)
    scheduleSave()
  }
  const closeEditor = async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current)
    if (!await flush()) return
    editingRef.current = null
    setEditing(null)
  }
  const toggleEnabled = async (): Promise<void> => {
    try { await window.whisperer.settings.update({ transformsEnabled: !state.settings.transformsEnabled }); await onRefresh() }
    catch { setError('Transform shortcuts could not be updated.') }
  }
  const reset = async (): Promise<void> => {
    if (!window.confirm('Are you sure you want to reset? Built-ins will be restored and custom transforms will be removed.')) return
    try { setDefinitions(await window.whisperer.transformations.reset()); editingRef.current = null; setEditing(null); await onRefresh() }
    catch { setError('Transforms could not be reset.') }
  }
  const remove = async (definition: TransformDefinition): Promise<void> => {
    if (!window.confirm(`Delete ${definition.name}?`)) return
    try { await window.whisperer.transformations.delete(definition.id); setDefinitions((items) => items.filter((item) => item.id !== definition.id)); await onRefresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'This transform could not be deleted.') }
  }

  return <div className="page transforms-page">
    <header className="transforms-page__header"><div><div className="transforms-page__title"><h1>Transforms</h1><span>Beta</span></div><p>Apply a saved instruction to selected text. The replacement is pasted only if the same text is still selected, and View changes shows the before and after.</p></div><div className="transforms-page__actions"><button className="transforms-view-changes" onClick={() => void window.whisperer.transformations.view().catch((reason) => setError(reason instanceof Error ? reason.message : 'There is no applied Transform to view yet.'))} title="View the last Transform's before and after" type="button"><span>View changes</span>{state.settings.shortcutBindings.transformView[0] ? <ShortcutChips platform={state.platform} value={state.settings.shortcutBindings.transformView[0]} /> : null}</button><label className="transforms-toggle"><input checked={state.settings.transformsEnabled} onChange={() => void toggleEnabled()} type="checkbox" /><span>Opt in</span></label></div></header>
    <TransformTutorial />
    {error ? <p className="transforms-error" role="alert">{error}</p> : null}
    <section className="transforms-auto" aria-labelledby="auto-transform-title"><div><h2 id="auto-transform-title">Auto Apply After Dictation</h2><p>Not available yet. Applying a transform automatically after dictation needs a secure way to replace text in the app you are writing in, so every transform is reviewed for now.</p></div><div className="transforms-auto__controls"><select aria-label="Automatic transform" disabled value=""><option>Unavailable</option></select><label className="transforms-switch"><input checked={false} disabled type="checkbox" /><span>Unavailable</span></label></div></section>
    <section className="transforms-list" aria-labelledby="my-transforms-title"><header><h2 id="my-transforms-title">My Transforms</h2><div><button className="button button--quiet" onClick={() => void reset()} type="button"><RotateCcw aria-hidden="true" size={15} />Reset to defaults</button><button className="button button--primary" disabled={definitions.length >= 9} onClick={() => openEditor({ key: crypto.randomUUID(), name: '', prompt: '', shortcut: '' })} type="button"><Plus aria-hidden="true" size={15} />Create new</button></div></header>{loading ? <p>Loading transforms…</p> : <div className="transforms-grid">{definitions.map((definition) => <article className="transform-card" key={definition.id}><button aria-label={`Edit ${definition.name}`} onClick={() => openEditor({ ...definition, key: definition.id })} type="button"><span className="transform-card__shortcut">{definition.shortcut ? <ShortcutChips platform={state.platform} value={definition.shortcut} /> : 'No shortcut'}</span><strong>{definition.name}</strong><p>{definition.prompt}</p></button>{!definition.builtIn ? <button aria-label={`Delete ${definition.name}`} className="transform-card__delete" onClick={() => void remove(definition)} type="button"><Trash2 aria-hidden="true" size={15} /></button> : null}</article>)}<button className="transform-card transform-card--create" disabled={definitions.length >= 9} onClick={() => openEditor({ key: crypto.randomUUID(), name: '', prompt: '', shortcut: '' })} type="button"><Plus aria-hidden="true" size={22} /><strong>Create your own</strong><span>Save a transform for repeated work.</span></button></div>}</section>
    <Dialog className="transform-editor-dialog" dismissOnEscape={false} hideHeader onClose={() => void closeEditor()} open={editing !== null} title={editing?.id ? `Edit ${editing.name}` : 'Create your own'}><TransformEditor draft={editing} error={saveState === 'error' ? error : undefined} onEscape={() => void closeEditor()} onUpdate={updateDraft} platform={state.platform} saveState={saveState} /></Dialog>
  </div>
}

/** Provides a local interactive explanation without pretending to transform untrusted page text. */
function TransformTutorial(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  return <section className="transforms-hero" aria-labelledby="transforms-hero-title"><div><h2 id="transforms-hero-title">Transform works anywhere you write</h2><p>Select text in another app, use one of your shortcuts, then review the proposed replacement before applying it.</p><div><button className="button button--primary" onClick={() => { setOpen(true); window.setTimeout(() => textarea.current?.focus(), 0) }} type="button">Try it out</button><button className="button button--quiet" onClick={() => setOpen((value) => !value)} type="button">How it works</button></div>{open ? <div className="transforms-tutorial"><label>Local practice text<textarea defaultValue="Select text in another app, then use a Transform shortcut." ref={textarea} /></label><ol><li>Select text where you are writing.</li><li>Use a configured Transform shortcut.</li><li>Review, then explicitly apply or copy the proposal.</li></ol></div> : null}</div><div aria-hidden="true" className="transforms-hero__art"><i /><i /><i /></div></section>
}

/** Edits one draft within the shared focused dialog primitive. */
function TransformEditor({ draft, error, onEscape, onUpdate, platform, saveState }: { draft: Draft | null; error?: string; onEscape: () => void; onUpdate: (patch: Partial<Draft>) => void; platform: BootstrapState['platform']; saveState: 'idle' | 'saving' | 'saved' | 'error' }): React.JSX.Element | null {
  if (!draft) return null
  return <section className="transform-editor" onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onEscape() } }}><aside><h2 id="transform-editor-title">{draft.id ? draft.name || 'Transform' : 'Create your own'}</h2><p>Set up a keyboard shortcut to apply this Transform, then tailor the prompt to your work.</p></aside><div className="transform-editor__main"><header><div><strong>Customize your transform</strong><span role="status">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Autosave on'}</span></div></header><div className="transform-editor__form"><label>Name your Transform<input autoFocus maxLength={80} onChange={(event) => onUpdate({ name: event.target.value })} placeholder="Boss mode" value={draft.name} /></label><label>Choose a keyboard shortcut<ShortcutRecorder actionLabel={draft.name || 'Transform'} onChange={(shortcut) => onUpdate({ shortcut })} platform={platform} value={draft.shortcut} /></label><label>Customize prompt<textarea maxLength={2000} onChange={(event) => onUpdate({ prompt: event.target.value })} placeholder="Describe how this should change selected text" value={draft.prompt} /><span>{draft.prompt.length}/2000</span></label>{error ? <p className="transforms-editor__hint" role="alert">{error}</p> : null}{!complete(draft) ? <p className="transforms-editor__hint">Name, prompt, and shortcut are required before autosave starts.</p> : null}</div></div></section>
}
