import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

/** Describes the visual emphasis for an action button. */
export type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger';

/** Defines properties accepted by the shared button control. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selects the control's visual emphasis. */
  tone?: ButtonTone;
}

/**
 * Renders an accessible, consistently styled action control.
 *
 * Args:
 *   children: Content that names the action.
 *   tone: Visual emphasis for the action.
 *   props: Native button properties forwarded to the control.
 *
 * Returns:
 *   A button element.
 */
export function Button({ children, className = '', tone = 'secondary', type = 'button', ...props }: PropsWithChildren<ButtonProps>) {
  return (
    <button className={`button button--${tone} ${className}`.trim()} type={type} {...props}>
      {children}
    </button>
  );
}
