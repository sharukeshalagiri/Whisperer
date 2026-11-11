import { ArrowDownAZ, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { deleteDictionaryEntry, listDictionary, saveDictionaryEntry } from './api'
import type { DictionaryEntry } from './api'
import { ContentError } from './NotesScreen'
import { errorMessage, useContentList } from './use-content-list'
import { filterDictionaryEntries } from './ui-screen-utils'

interface DictionaryForm {
  id?: string
  phrase: string
  replacement: string
  correctMisspelling: boolean
}

type SortOrder = 'recent' | 'alphabetical'

/** Provides personal text-correction management for dictation. */
export function DictionaryScreen(): React.JSX.Element {
  const { error: loadError, isLoading, items, reload, setItems } = useContentList(listDictionary)
  const [form, setForm] = useState<DictionaryForm | undefined>()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'personal'>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent')
  const [error, setError] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const visibleItems = useMemo(() => {
    const filtered = filterDictionaryEntries(items, query)
    return sortOrder === 'alphabetical'
      ? [...filtered].sort((left, right) => left.phrase.localeCompare(right.phrase))
      : filtered
  }, [items, query, sortOrder])

  const addEntry = () => {
    setError(undefined)
    setForm({ phrase: '', replacement: '', correctMisspelling: false })
  }
  const editEntry = (entry: DictionaryEntry) => {
    setError(undefined)
    setForm({
      id: entry.id,
      phrase: entry.phrase,
      replacement: entry.replacement,
      correctMisspelling: Boolean(entry.replacement),
    })
  }
  const openSearch = () => {
    setSearchOpen(true)
    requestAnimationFrame(() => searchRef.current?.focus())
  }
  const closeSearch = () => {
    setQuery('')
    setSearchOpen(false)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form) return
    if (!form.phrase.trim() || (form.correctMisspelling && !form.replacement.trim())) {
      setError(form.correctMisspelling ? 'Enter both the misspelling and its correction.' : 'Enter a word or phrase.')
      return
    }
    setIsSaving(true)
    setError(undefined)
    try {
      const saved = await saveDictionaryEntry({
        id: form.id,
        phrase: form.phrase.trim(),
        replacement: form.correctMisspelling ? form.replacement.trim() : '',
      })
      setItems((entries) => form.id
        ? entries.map((entry) => entry.id === saved.id ? saved : entry)
        : [saved, ...entries])
      setForm(undefined)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }
  const remove = async (entry: DictionaryEntry) => {
    if (!window.confirm(`Delete “${entry.phrase}” from your dictionary?`)) return
    setError(undefined)
    try {
      await deleteDictionaryEntry(entry.id)
      setItems((entries) => entries.filter(({ id }) => id !== entry.id))
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  return (
    <main className="page ui-content ui-dictionary">
      <header className="ui-content__header">
        <h1>Dictionary</h1>
        <button className="ui-button ui-button--dark" type="button" onClick={addEntry}>
          <Plus aria-hidden="true" size={17} /> Add new
        </button>
      </header>
      <section className="ui-dictionary__workspace" aria-label="Personal dictionary">
        <div className="ui-tabs" role="tablist" aria-label="Dictionary scope">
          <button className={scope === 'all' ? 'is-active' : ''} role="tab" type="button" aria-selected={scope === 'all'} onClick={() => setScope('all')}>All</button>
          <button className={scope === 'personal' ? 'is-active' : ''} role="tab" type="button" aria-selected={scope === 'personal'} onClick={() => setScope('personal')}>Personal</button>
          <div className="ui-tabs__actions">
            {searchOpen ? <label className="ui-tabs__search" htmlFor="dictionary-search">
              <Search aria-hidden="true" size={16} />
              <span className="sr-only">Search dictionary</span>
              <input id="dictionary-search" ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dictionary" />
              <button type="button" aria-label="Close search" onClick={closeSearch}><X aria-hidden="true" size={15} /></button>
            </label> : <button className="ui-icon-button" type="button" aria-label="Search dictionary" title="Search dictionary" onClick={openSearch}><Search aria-hidden="true" size={18} /></button>}
            <button className="ui-icon-button" type="button" aria-label={`Sort dictionary by ${sortOrder === 'recent' ? 'A–Z' : 'recent'}`} title={sortOrder === 'recent' ? 'Sort A–Z' : 'Sort by recent'} onClick={() => setSortOrder((order) => order === 'recent' ? 'alphabetical' : 'recent')}><ArrowDownAZ aria-hidden="true" size={18} /></button>
            <button className="ui-icon-button" type="button" aria-label="Refresh dictionary" title="Refresh dictionary" onClick={() => void reload()}><RefreshCw aria-hidden="true" size={18} /></button>
          </div>
        </div>
        {error ? <p className="ui-alert" role="alert">{error}</p> : null}
        {isLoading ? <p className="ui-status">Loading dictionary…</p> : null}
        {loadError ? <ContentError message={loadError} retry={reload} /> : null}
        {!isLoading && !loadError && !items.length ? <DictionaryEmpty onAdd={addEntry} /> : null}
        {!isLoading && !loadError && items.length > 0 && !visibleItems.length ? <div className="ui-empty ui-empty--compact"><h2>No matching words</h2><p>Try a different spelling or clear your search.</p></div> : null}
        {visibleItems.length ? <div className="ui-dictionary__rows" role="table" aria-label="Personal dictionary entries">
          {visibleItems.map((entry) => <div className="ui-dictionary__row" key={entry.id} role="row">
            <button className="ui-dictionary__entry" type="button" role="cell" onClick={() => editEntry(entry)}>{entry.phrase}</button>
            <span className="ui-dictionary__arrow" aria-hidden="true">→</span>
            <button className="ui-dictionary__entry" type="button" role="cell" onClick={() => editEntry(entry)}>{entry.replacement || entry.phrase}</button>
            <span className="ui-row-actions" role="cell">
              <button type="button" aria-label={`Edit ${entry.phrase}`} onClick={() => editEntry(entry)}><Pencil aria-hidden="true" size={16} /></button>
              <button type="button" aria-label={`Delete ${entry.phrase}`} onClick={() => void remove(entry)}><Trash2 aria-hidden="true" size={16} /></button>
            </span>
          </div>)}
        </div> : null}
      </section>
      {form ? <DictionaryDialog form={form} isSaving={isSaving} onCancel={() => setForm(undefined)} onChange={setForm} onSubmit={submit} /> : null}
    </main>
  )
}

/** Renders the empty personal-dictionary teaching state. */
function DictionaryEmpty({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return <div className="ui-empty ui-dictionary__empty"><div className="ui-empty__mark" aria-hidden="true">Aa</div><h2>Make every word count</h2><p>Add a word or phrase and choose exactly how it should appear in your dictation.</p><button className="ui-button ui-button--dark" type="button" onClick={onAdd}>Add word</button></div>
}

/** Renders the focused add-or-edit replacement dialog. */
function DictionaryDialog({ form, isSaving, onCancel, onChange, onSubmit }: {
  form: DictionaryForm
  isSaving: boolean
  onCancel: () => void
  onChange: (form: DictionaryForm) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}): React.JSX.Element {
  return <div className="ui-modal-backdrop" role="presentation"><form className="ui-dialog ui-dialog--dictionary" aria-labelledby="dictionary-dialog-title" aria-modal="true" role="dialog" onSubmit={(event) => void onSubmit(event)}>
    <header className="ui-dialog__header"><h2 id="dictionary-dialog-title">{form.id ? 'Edit vocabulary' : 'Add to vocabulary'}</h2></header>
    <label className="ui-check"><span>Correct a misspelling</span><input type="checkbox" checked={form.correctMisspelling} onChange={(event) => onChange({ ...form, correctMisspelling: event.target.checked })} /></label>
    <label className="sr-only" htmlFor="dictionary-phrase">Word or phrase</label><input autoFocus id="dictionary-phrase" value={form.phrase} placeholder="Add a new word" onChange={(event) => onChange({ ...form, phrase: event.target.value })} />
    {form.correctMisspelling ? <><label className="sr-only" htmlFor="dictionary-replacement">Replacement</label><input id="dictionary-replacement" value={form.replacement} placeholder="Correct spelling" onChange={(event) => onChange({ ...form, replacement: event.target.value })} /></> : null}
    <footer className="ui-dialog__actions"><button className="ui-button" type="button" onClick={onCancel}>Cancel</button><button className="ui-button ui-button--dark" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : form.id ? 'Save word' : 'Add word'}</button></footer>
  </form></div>
}
