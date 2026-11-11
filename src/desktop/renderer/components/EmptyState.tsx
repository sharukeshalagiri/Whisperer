import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Defines copy and optional actions for an empty content region. */
export interface EmptyStateProps {
  /** Icon that identifies the empty content type. */
  icon: LucideIcon;
  /** Concise explanation of the unavailable content. */
  description: string;
  /** Short title for the empty region. */
  title: string;
  /** Optional user action that can resolve the empty state. */
  action?: ReactNode;
}

/**
 * Renders a clear, quiet empty state with an optional next action.
 *
 * Args:
 *   icon: Visual identifier for the empty content type.
 *   description: Explanation of how this area will be populated.
 *   title: Empty state title.
 *   action: Optional action element.
 *
 * Returns:
 *   An accessible empty-state section.
 */
export function EmptyState({ action, description, icon: Icon, title }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-label={title}>
      <span className="empty-state__icon"><Icon aria-hidden="true" size={24} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  );
}
