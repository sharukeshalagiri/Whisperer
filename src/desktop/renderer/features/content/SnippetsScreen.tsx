import { ArrowDownAZ, ChevronRight, MoreHorizontal, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { deleteSnippet, listSnippets, saveSnippet } from './api'
import type { Snippet } from './api'
import { ContentError } from './NotesScreen'
import { errorMessage, useContentList } from './use-content-list'
import { filterSnippets } from './ui-screen-utils'

interface SnippetForm {
  id?: string
  shortcut: string
  text: string
}

type SortOrder = 'recent' | 'alphabetical'

/** Manages saved spoken-trigger snippet expansions. */
export function SnippetsScreen(): React.JSX.Element {
  const { error: loadError, isLoading, items, reload, setItems } = useContentList(listSnippets)
  const [form, setForm] = useState<SnippetForm | undefined>()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'personal'>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent')
  const [error, setError] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | undefined>()
  const searchRef = useRef<HTMLInputElement>(null)
  const visibleItems = useMemo(() => {
    const filtered = filterSnippets(items, query)
    return sortOrder === 'alphabetical'
      ? [...filtered].sort((left, right) => left.shortcut.localeCompare(right.shortcut))
      : filtered
  }, [items, query, sortOrder])

  const add = () => {
    setError(undefined)
    setForm({ shortcut: '', text: '' })
  }
  const edit = (snippet: Snippet) => {
    setError(undefined)
    setOpenMenu(undefined)
    setForm({ id: snippet.id, shortcut: snippet.shortcut, text: snippet.text })
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
    if (!form.shortcut.trim() || !form.text.trim()) {
      setError('Enter both a trigger and snippet text.')
      return
    }
    setIsSaving(true)
    setError(undefined)
    try {
      const saved = await saveSnippet({ id: form.id, shortcut: form.shortcut.trim(), text: form.text })
      setItems((snippets) => form.id
        ? snippets.map((snippet) => snippet.id === saved.id ? saved : snippet)
        : [saved, ...snippets])
      setForm(undefined)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }
  const remove = async (snippet: Snippet) => {
    if (!window.confirm(`Delete “${snippet.shortcut}”?`)) return
    setOpenMenu(undefined)
    try {
      await deleteSnippet(snippet.id)
      setItems((snippets) => snippets.filter(({ id }) => id !== snippet.id))
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  return (
    <main className="page ui-content ui-snippets">
      <header className="ui-content__header">
        <h1>Snippets</h1>
        <button className="ui-button ui-button--dark" type="button" onClick={add}>
          <Plus aria-hidden="true" size={17} /> Add new
        </button>
      </header>
      <section className="ui-snippets__workspace" aria-label="Saved snippets">
        <div className="ui-tabs" role="tablist" aria-label="Snippet scope">
          <button className={scope === 'all' ? 'is-active' : ''} role="tab" type="button" aria-selected={scope === 'all'} onClick={() => setScope('all')}>All</button>
          <button className={scope === 'personal' ? 'is-active' : ''} role="tab" type="button" aria-selected={scope === 'personal'} onClick={() => setScope('personal')}>Personal</button>
          <div className="ui-tabs__actions">
            {searchOpen ? <label className="ui-tabs__search" htmlFor="snippet-search">
              <Search aria-hidden="true" size={16} />
              <span className="sr-only">Search snippets</span>
              <input id="snippet-search" ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search snippets" />
              <button type="button" aria-label="Close search" onClick={closeSearch}><X aria-hidden="true" size={15} /></button>
            </label> : <button className="ui-icon-button" type="button" aria-label="Search snippets" title="Search snippets" onClick={openSearch}><Search aria-hidden="true" size={18} /></button>}
            <button className="ui-icon-button" type="button" aria-label={`Sort snippets by ${sortOrder === 'recent' ? 'A–Z' : 'recent'}`} title={sortOrder === 'recent' ? 'Sort A–Z' : 'Sort by recent'} onClick={() => setSortOrder((order) => order === 'recent' ? 'alphabetical' : 'recent')}><ArrowDownAZ aria-hidden="true" size={18} /></button>
            <button className="ui-icon-button" type="button" aria-label="Refresh snippets" title="Refresh snippets" onClick={() => void reload()}><RefreshCw aria-hidden="true" size={18} /></button>
          </div>
        </div>
        <SnippetHero />
        {error ? <p className="ui-alert" role="alert">{error}</p> : null}
        {isLoading ? <p className="ui-status">Loading snippets…</p> : null}
        {loadError ? <ContentError message={loadError} retry={reload} /> : null}
        {!isLoading && !loadError && items.length > 0 && !visibleItems.length ? <div className="ui-empty ui-empty--compact"><h2>No matching snippets</h2><p>Try a different search.</p></div> : null}
        {visibleItems.length ? <div className="ui-snippets__list">
          {visibleItems.map((snippet) => <article className="ui-snippet-row" key={snippet.id}>
            <button className="ui-snippet-row__main" type="button" onClick={() => edit(snippet)}>
              <kbd>{snippet.shortcut}</kbd>
              <span><strong>{snippet.text}</strong><small>Trigger · {snippet.shortcut}</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </button>
            <div className="ui-menu-wrap">
              <button className="ui-icon-button" type="button" aria-label={`Actions for ${snippet.shortcut}`} aria-expanded={openMenu === snippet.id} onClick={() => setOpenMenu(openMenu === snippet.id ? undefined : snippet.id)}><MoreHorizontal aria-hidden="true" size={19} /></button>
              {openMenu === snippet.id ? <div className="ui-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => edit(snippet)}>Edit snippet</button>
                <button type="button" role="menuitem" onClick={() => void remove(snippet)}><Trash2 aria-hidden="true" size={15} /> Delete</button>
              </div> : null}
            </div>
          </article>)}
        </div> : null}
      </section>
      {form ? <SnippetDialog form={form} isSaving={isSaving} onCancel={() => setForm(undefined)} onChange={setForm} onSubmit={submit} /> : null}
    </main>
  )
}

/** Renders the visual introduction to spoken snippet expansions. */
function SnippetHero(): React.JSX.Element {
  return <section className="ui-snippets__hero" aria-label="How snippets work">
    <h2>The stuff <em>you</em> shouldn’t have to<br />re-type.</h2>
    <p>Save text you type often — an email, intro, or prompt — then say a word to drop it in instantly.</p>
    <div className="ui-snippet-examples" aria-label="Snippet examples">
      <span><b>“my LinkedIn”</b><i>→</i><strong>https://www.linkedin.com/in/john-doe/</strong></span>
      <span><b>“rewrite prompt”</b><i>→</i><strong>Rewrite this to be clearer and more concise, keeping my tone.</strong></span>
      <span><b>“intro email”</b><i>→</i><strong>Hey, would love to find some time to chat later this week. Does Thursday work for you?</strong></span>
    </div>
  </section>
}

/** Renders the add-or-edit snippet dialog. */
function SnippetDialog({ form, isSaving, onCancel, onChange, onSubmit }: {
  form: SnippetForm
  isSaving: boolean
  onCancel: () => void
  onChange: (form: SnippetForm) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}): React.JSX.Element {
  return <div className="ui-modal-backdrop" role="presentation"><form className="ui-dialog ui-dialog--snippet" aria-labelledby="snippet-dialog-title" aria-modal="true" role="dialog" onSubmit={(event) => void onSubmit(event)}>
    <header className="ui-dialog__header"><h2 id="snippet-dialog-title">{form.id ? 'Edit snippet' : 'Add snippet'}</h2></header>
    <label className="sr-only" htmlFor="snippet-shortcut">Snippet</label><input autoFocus id="snippet-shortcut" value={form.shortcut} placeholder="Snippet" onChange={(event) => onChange({ ...form, shortcut: event.target.value })} />
    <label className="sr-only" htmlFor="snippet-text">Expansion</label><textarea id="snippet-text" value={form.text} placeholder="Expansion" onChange={(event) => onChange({ ...form, text: event.target.value })} />
    <footer className="ui-dialog__actions"><button className="ui-button" type="button" onClick={onCancel}>Cancel</button><button className="ui-button ui-button--dark" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : form.id ? 'Save snippet' : 'Add snippet'}</button></footer>
  </form></div>
}
