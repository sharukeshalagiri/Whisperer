import type { PropsWithChildren, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Defines the content and lifecycle handlers for a modal dialog. */
export interface DialogProps {
  /** Human-readable title announced to assistive technology. */
  title: string;
  /** Whether the dialog is currently rendered. */
  open: boolean;
  /** Closes the dialog in response to an explicit user action. */
  onClose: () => void;
  /** Optional actions displayed below the dialog content. */
  footer?: ReactNode;
  /** Removes visual title chrome while retaining an accessible title and close action. */
  hideHeader?: boolean;
  /** Lets a nested shortcut recorder own Escape rather than dismissing this dialog. */
  dismissOnEscape?: boolean;
  /** Optional feature class for dialog size and layout, without changing focus behavior. */
  className?: string;
}

/**
 * Presents focused, dismissible modal content above the active workspace.
 *
 * Args:
 *   title: Dialog title.
 *   open: Whether to show the dialog.
 *   onClose: Callback invoked for escape and close actions.
 *   footer: Optional action area.
 *   hideHeader: Whether title chrome should be visually omitted.
 *   children: Dialog body content.
 *   className: Feature-specific size or layout class.
 *   dismissOnEscape: Whether the shared dialog or a nested input owns Escape.
 *
 * Returns:
 *   A modal dialog or null while closed.
 */
export function Dialog({ children, className = '', dismissOnEscape = true, footer, hideHeader = false, onClose, open, title }: PropsWithChildren<DialogProps>) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (dismissOnEscape && event.key === 'Escape' && !event.defaultPrevented) onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [dismissOnEscape, open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        aria-labelledby="dialog-title"
        aria-modal="true"
        className={`dialog${hideHeader ? ' dialog--bare' : ''} ${className}`.trim()}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {hideHeader ? <>
          <h2 className="sr-only" id="dialog-title">{title}</h2>
          <button ref={closeButtonRef} aria-label="Close dialog" className="icon-button dialog__close" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </> : <header className="dialog__header">
          <h2 id="dialog-title">{title}</h2>
          <button ref={closeButtonRef} aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>}
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
