import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'

import { ArrowUpRight, Laptop } from 'lucide-react'

import sidebarLogoDarkUrl from '../../../assets/sidebar-logo-dark.svg'
import sidebarLogoLightUrl from '../../../assets/sidebar-logo-light.svg'
import { DeviceSetupLayout } from './DeviceSetupLayout'
import { messageFromError } from './deviceApi'

export interface SignInScreenProps {
  /** Refreshes app bootstrap state after browser-based device sign-in completes. */
  onComplete: () => Promise<void>
}

/** Starts browser device-code sign-in without exposing account credentials to the renderer. */
export function SignInScreen({ onComplete }: SignInScreenProps): ReactElement {
  const [apiHost, setApiHost] = useState('')
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'device'>('idle')
  const [error, setError] = useState<string>()
  const errorRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  async function startSignIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const server = apiHost.trim()
    try {
      const url = new URL(server)
      if (url.protocol !== 'https:' && url.protocol !== 'http:')
        throw new Error('Enter an HTTP or HTTPS server URL.')
    } catch (validationError) {
      setError(messageFromError(validationError, 'Enter a valid server URL.'))
      return
    }

    setError(undefined)
    setPhase('waiting')
    try {
      await window.whisperer.auth.signIn(server)
      await onComplete()
    } catch (signInError) {
      setError(messageFromError(signInError, 'We could not complete sign-in. Try again.'))
      setPhase('idle')
    }
  }

  async function cancelSignIn(): Promise<void> {
    try {
      await window.whisperer.auth.cancel()
      setError('Sign-in cancelled. You can try again when you are ready.')
    } catch (cancelError) {
      setError(messageFromError(cancelError, 'We could not cancel sign-in. Try again.'))
    } finally {
      setPhase('idle')
    }
  }

  /** Chooses the server on this device. It downloads nothing; setup asks first. */
  async function continueOnDevice(): Promise<void> {
    setError(undefined)
    setPhase('device')
    try {
      await window.whisperer.settings.setConnectionMode('device')
      await onComplete()
    } catch (modeError) {
      setError(messageFromError(modeError, 'We could not switch to this device. Try again.'))
      setPhase('idle')
    }
  }

  const pending = phase !== 'idle'
  return (
    <main className="page sign-in-page device-setup-page" aria-labelledby="sign-in-title">
      <DeviceSetupLayout
        section={0}
        right={
          <aside className="device-setup-right sign-in-art" aria-hidden="true" />
        }
      >
        <section className="device-setup-left sign-in-panel">
          <img
            className="product-mark product-mark--light"
            src={sidebarLogoLightUrl}
            alt="Whisperer"
          />
          <img
            className="product-mark product-mark--dark"
            src={sidebarLogoDarkUrl}
            alt="Whisperer"
          />
          <div className="device-setup-heading">
            <h1 id="sign-in-title">Let&apos;s get you started</h1>
            <p>Accurate voice-to-text, everywhere you work</p>
          </div>

          <form className="sign-in-form" onSubmit={startSignIn} noValidate>
            <label htmlFor="server-url">Whisperer server URL</label>
            <input
              className="device-input"
              id="server-url"
              type="url"
              autoComplete="url"
              inputMode="url"
              placeholder="https://whisperer.example.com"
              value={apiHost}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'sign-in-hint sign-in-error' : 'sign-in-hint'}
              onChange={(event) => setApiHost(event.target.value)}
              required
            />
            <p className="device-hint" id="sign-in-hint">
              Your organization&apos;s Whisperer API server. Sign-in opens in your browser.
            </p>
            {error ? (
              <p
                className="device-error"
                id="sign-in-error"
                role="alert"
                tabIndex={-1}
                ref={errorRef}
              >
                {error}
              </p>
            ) : null}
            {pending ? (
              <p className="device-hint" role="status">
                Your browser is open. Finish signing in there, then return here.
              </p>
            ) : null}
            <button
              className="device-button device-button--large"
              type="submit"
              disabled={pending || !apiHost.trim()}
            >
              {pending ? <span className="device-spinner" aria-hidden="true" /> : null}
              Sign in via browser <ArrowUpRight size={18} aria-hidden="true" />
            </button>
            {phase === 'waiting' ? (
              <button
                className="device-button device-button--link"
                type="button"
                onClick={() => void cancelSignIn()}
              >
                Cancel sign-in
              </button>
            ) : null}
          </form>
          {phase !== 'waiting' ? (
            <div className="sign-in-device">
              <button
                className="device-button device-button--link"
                type="button"
                disabled={pending}
                aria-describedby="sign-in-device-hint"
                onClick={() => void continueOnDevice()}
              >
                {phase === 'device' ? (
                  <span className="device-spinner" aria-hidden="true" />
                ) : (
                  <Laptop size={16} aria-hidden="true" />
                )}
                Continue without signing in
              </button>
              <p className="device-hint" id="sign-in-device-hint">
                Runs the Whisperer server on this device. You choose where speech and text are
                processed next.
              </p>
            </div>
          ) : null}
        </section>
      </DeviceSetupLayout>
    </main>
  )
}
