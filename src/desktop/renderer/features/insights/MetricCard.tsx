import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

/** A bounded dashboard card: one headline figure, its uppercase label and an optional detail area below a rule. */
export interface MetricCardProps {
  /** Headline figure, already formatted. */
  value: ReactNode
  /** Short uppercase label beneath the figure. */
  label: string
  /** Explanation shown in a tooltip beside the label. */
  hint?: string
  /** Content pinned to the card's top-right corner. */
  badge?: ReactNode
  /** Detail rows or a visual below the headline. */
  children?: ReactNode
  /** Extra class for grid placement. */
  className?: string
}

/** Renders one card of the insights grid. */
export function MetricCard({ value, label, hint, badge, children, className }: MetricCardProps): React.JSX.Element {
  return (
    <section className={`metric-card${className ? ` ${className}` : ''}`} aria-label={label}>
      <header className="metric-card__head">
        <div>
          <p className="metric-card__value">{value}</p>
          <p className="metric-card__label">
            {label}
            {hint ? <InfoHint text={hint} /> : null}
          </p>
        </div>
        {badge ? <div className="metric-card__badge">{badge}</div> : null}
      </header>
      {children ? <div className="metric-card__body">{children}</div> : null}
    </section>
  )
}

/** A small information icon whose explanation is read by hover and by assistive technology. */
export function InfoHint({ text }: { text: string }): React.JSX.Element {
  return (
    <span className="metric-card__hint" title={text} role="img" aria-label={text}>
      <Info aria-hidden="true" size={14} />
    </span>
  )
}

/** One labelled figure in a card's detail area. */
export function MetricRow({ value, label, hint }: { value: ReactNode; label: string; hint?: string }): React.JSX.Element {
  return (
    <p className="metric-card__row">
      <strong>{value}</strong> {label}
      {hint ? <InfoHint text={hint} /> : null}
    </p>
  )
}
