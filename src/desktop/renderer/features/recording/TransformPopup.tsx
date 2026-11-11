import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronDown, X } from 'lucide-react'

import type { TransformActivity } from '../../../shared/contracts'
import { diffWords } from '../../../shared/textDiff'
import './transform-popup.css'

/**
 * Shows a finished shortcut transform above the pill without taking focus from the user's app.
 *
 * The compact notice says the transform was applied and offers See changes, which expands a red/green
 * word comparison of the original and the replacement. Failures show the reason instead.
 */
export function TransformPopup(): React.JSX.Element | null {
  const [activity, setActivity] = useState<TransformActivity | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    void window.whisperer.bootstrap().then((state) => setActivity(state.transform)).catch(() => undefined)
    return window.whisperer.events.onState((state) => {
      setActivity(state.transform)
      setExpanded(state.transform?.phase === 'applied' && state.transform.expanded === true)
    })
  }, [])

  const segments = useMemo(() => (activity?.phase === 'applied' ? diffWords(activity.sourceText, activity.proposal) : []), [activity])
  if (!activity || activity.phase === 'applying') return null

  const toggle = (): void => {
    const next = !expanded
    setExpanded(next)
    void window.whisperer.transformPopup.setExpanded(next).catch(() => undefined)
  }
  const dismiss = (): void => { void window.whisperer.transformPopup.dismiss().catch(() => undefined) }
  const failed = activity.phase === 'failed'

  return <aside
    aria-live="polite"
    className={`transform-popup${expanded ? ' is-expanded' : ''}${failed ? ' is-failed' : ''}`}
    onPointerEnter={() => void window.whisperer.transformPopup.setPinned(true).catch(() => undefined)}
    onPointerLeave={() => void window.whisperer.transformPopup.setPinned(false).catch(() => undefined)}
  >
    <header className="transform-popup__bar">
      <span aria-hidden="true" className="transform-popup__icon">{failed ? <AlertCircle size={14} /> : <Check size={14} strokeWidth={3} />}</span>
      <span className="transform-popup__title">
        <strong>{failed ? `${activity.name} not applied` : `${activity.name} applied`}</strong>
        {failed ? <small>{activity.message}</small> : null}
      </span>
      {failed ? null : <button aria-expanded={expanded} className="transform-popup__toggle" onClick={toggle} type="button">
        {expanded ? 'Hide' : 'See changes'}<ChevronDown aria-hidden="true" size={13} />
      </button>}
      <button aria-label="Close" className="transform-popup__close" onClick={dismiss} type="button"><X aria-hidden="true" size={13} /></button>
    </header>
    {expanded && !failed ? <section aria-label="Changes made by the transform" className="transform-popup__diff">
      <p>{segments.map((segment, index) => {
        if (segment.kind === 'same') return <span key={index}>{segment.text}</span>
        // Keep edge whitespace outside the highlight so neighbouring changes stay visibly separate.
        const [, lead = '', word = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/u.exec(segment.text) ?? []
        const Mark = segment.kind === 'removed' ? 'del' : 'ins'
        return <span key={index}>{lead}{word ? <Mark>{word}</Mark> : null}{trail}</span>
      })}</p>
      <footer><span className="transform-popup__legend transform-popup__legend--removed">Removed</span><span className="transform-popup__legend transform-popup__legend--added">Added</span></footer>
    </section> : null}
  </aside>
}
