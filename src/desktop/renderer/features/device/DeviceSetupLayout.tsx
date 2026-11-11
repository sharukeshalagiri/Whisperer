import type { CSSProperties, ReactElement, ReactNode } from 'react'

import './device-setup.css'

import { SIGN_IN_SECTIONS } from './setup-sections'

export interface DeviceSetupLayoutProps {
  /** Current device-only progress section, from sign-in through the tutorial. */
  section: number
  /** Content on the left of the desktop setup window. */
  children: ReactNode
  /** Device configuration or decorative content on the right. */
  right: ReactNode
  /** Rail labels; defaults to the signed-in rail. */
  sections?: readonly string[]
}

/** Shares the desktop titlebar progress and two-panel presentation without owning setup state. */
export function DeviceSetupLayout({
  section,
  children,
  right,
  sections = SIGN_IN_SECTIONS,
}: DeviceSetupLayoutProps): ReactElement {
  const progress = {
    '--setup-progress': `${((section + 1) / sections.length) * 100}%`,
  } as CSSProperties
  return (
    <>
      <header className="device-setup-chrome" style={progress}>
        <ol className="sign-in-rail" aria-label="Getting started progress">
          {sections.map((label, index) => (
            <li
              key={label}
              className={index <= section ? 'is-current' : undefined}
              aria-current={index === section ? 'step' : undefined}
            >
              {label}
              {index < sections.length - 1 ? <span aria-hidden="true">›</span> : null}
            </li>
          ))}
        </ol>
      </header>
      <div className="device-setup-layout">
        {children}
        {right}
      </div>
    </>
  )
}
