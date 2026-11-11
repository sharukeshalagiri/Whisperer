import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Check, Keyboard, Mic, MousePointerClick, RefreshCw } from 'lucide-react'

import type { Capabilities } from '../../../shared/contracts'
import { DeviceSetupLayout } from './DeviceSetupLayout'
import { listPermissions, messageFromError, requestPermission } from './deviceApi'
import { confirmMicrophoneAccess } from './onboardingPermissions'
import { preflightItems, preflightReady, type PreflightPermission } from './permissionCheck'

export interface PermissionsCheckScreenProps {
  /** Latest capability report from bootstrap state. */
  capabilities: Capabilities
  /** Leaves the checklist, either because everything is ready or the user chose to continue. */
  onContinue: () => void
}

const ICONS = { microphone: Mic, accessibility: Keyboard, automation: MousePointerClick } as const

/** Checks every macOS permission dictation needs and sends the user straight to each settings page. */
export function PermissionsCheckScreen({ capabilities, onContinue }: PermissionsCheckScreenProps): ReactElement {
  const [current, setCurrent] = useState(capabilities)
  const [microphoneConfirmed, setMicrophoneConfirmed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<string>()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const items = preflightItems(current, microphoneConfirmed)
  const ready = preflightReady(items)

  const recheck = useCallback(async (): Promise<void> => {
    setChecking(true)
    try {
      // Probing Automation is silent once answered; the first probe shows the macOS consent prompt.
      setCurrent(await window.whisperer.permissions.check())
    } catch (error) {
      setMessage(messageFromError(error, 'We could not check permissions. Try again.'))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    titleRef.current?.focus()
    void recheck()
    // Returning from System Settings refocuses this window; recheck so granted rows turn green.
    const onFocus = (): void => { void recheck() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [recheck])

  async function grant(id: PreflightPermission): Promise<void> {
    setMessage(undefined)
    try {
      await requestPermission(id)
      if (id === 'microphone') {
        await confirmMicrophoneAccess(
          () => navigator.mediaDevices.getUserMedia({ audio: true }),
          () => setMicrophoneConfirmed(true),
        )
      }
      setCurrent(await listPermissions())
    } catch (error) {
      setMessage(messageFromError(error, 'We could not request this permission.'))
    }
  }

  async function openSettings(id: PreflightPermission): Promise<void> {
    setMessage(undefined)
    try {
      await window.whisperer.permissions.openSettings(id)
    } catch (error) {
      setMessage(messageFromError(error, 'We could not open System Settings.'))
    }
  }

  return (
    <main className="page device-setup-page" aria-labelledby="permissions-check-title">
      <DeviceSetupLayout
        section={0}
        right={
          <aside className="device-setup-right" aria-label="Permission checklist">
            <section className="device-setup-card">
              <div className="device-permissions">
                {items.map((item) => {
                  const Icon = ICONS[item.id]
                  return (
                    <section className="device-permission" key={item.id}>
                      <span className="device-permission-icon" aria-hidden="true"><Icon size={22} /></span>
                      <div>
                        <h2>{item.title}</h2>
                        <p>{item.description}</p>
                        {!item.ready && item.capability.reason ? <p className="device-hint">{item.capability.reason}</p> : null}
                      </div>
                      {item.ready ? (
                        <span className="device-permission-status">
                          <Check size={16} aria-hidden="true" />
                          {item.required ? 'Allowed' : 'Not required'}
                        </span>
                      ) : (
                        <div className="device-permission-actions">
                          <button className="device-button" type="button" onClick={() => void grant(item.id)}>
                            Allow
                          </button>
                          <button className="device-button device-button--link" type="button" onClick={() => void openSettings(item.id)}>
                            Open System Settings
                          </button>
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </section>
          </aside>
        }
      >
        <section className="device-setup-left">
          <div className="device-setup-heading">
            <h1 id="permissions-check-title" tabIndex={-1} ref={titleRef}>
              {ready ? 'Everything is ready' : 'Check your Mac permissions'}
            </h1>
            <p>
              {ready
                ? 'Whisperer can hear you, respond to your shortcuts and paste where your cursor is.'
                : 'Whisperer needs these permissions to hear you, respond to your shortcuts and paste where your cursor is. Allow each one, then return here.'}
            </p>
          </div>
          {message ? <p className="device-error" role="alert">{message}</p> : null}
          <button className="device-button device-button--large" type="button" onClick={onContinue}>
            {ready ? 'Continue' : 'Continue anyway'}
          </button>
          <button className="device-button device-button--link" type="button" disabled={checking} onClick={() => void recheck()}>
            <RefreshCw size={14} aria-hidden="true" /> {checking ? 'Checking…' : 'Check again'}
          </button>
        </section>
      </DeviceSetupLayout>
    </main>
  )
}
