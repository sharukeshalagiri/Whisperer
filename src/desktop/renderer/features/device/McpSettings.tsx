import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ReactElement } from 'react'

import { mcpAppSnippets, mcpEndpoint } from './mcp-connect'
import type { McpAppId } from './mcp-connect'

export interface McpSettingsProps {
  /** Saved server URL; null in Laptop mode or before sign-in. */
  apiHost: string | null
  /** Whether the desktop currently uses the on-device server. */
  deviceMode: boolean
}

type Copied = McpAppId | 'endpoint' | null

/** Explains the MCP connection and offers copyable setup for each supported AI app. */
export function McpSettings({ apiHost, deviceMode }: McpSettingsProps): ReactElement {
  const endpoint = deviceMode ? null : mcpEndpoint(apiHost)
  const [copied, setCopied] = useState<Copied>(null)

  // Reset the "Copied" confirmation so the button returns to its resting label.
  useEffect(() => {
    if (copied === null) return
    const timer = window.setTimeout(() => setCopied(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy(id: Exclude<Copied, null>, text: string): Promise<void> {
    await window.whisperer.clipboard.copy(text)
    setCopied(id)
  }

  return (
    <div className="settings-mcp">
      <p className="settings-mcp__lede">
        MCP syncs Notetaker with your favorite AI app, so you can ask it about your meeting
        transcripts and notes. It reads only your meetings and summaries. MCP has no access to
        dictation, your dictionary or audio, and it cannot change anything.
      </p>

      {endpoint === null ? (
        <p className="settings-unavailable" role="status">
          {deviceMode
            ? 'MCP is available when Whisperer is connected to a Whisperer server. The on-device server does not expose it.'
            : 'Sign in to a Whisperer server to get your MCP connection URL.'}
        </p>
      ) : (
        <>
          <div className="settings-rows">
            <div className="settings-row settings-row--mcp-endpoint">
              <div>
                <strong>Connection URL</strong>
                <p>Your AI app signs in to this address in the browser. Nothing is shared until you approve it there.</p>
                <code className="settings-mcp__endpoint" data-testid="mcp-endpoint">{endpoint}</code>
              </div>
              <CopyButton copied={copied === 'endpoint'} label="Copy URL" onClick={() => void copy('endpoint', endpoint)} />
            </div>
          </div>

          <h2 className="settings-section-label">Quick setup</h2>
          <div className="settings-rows settings-mcp__apps">
            {mcpAppSnippets(endpoint).map((app) => (
              <details className="settings-row settings-row--mcp-app" key={app.id}>
                <summary>
                  <span>
                    <strong>Add to {app.label}</strong>
                    <p>{app.hint}</p>
                  </span>
                  <CopyButton
                    copied={copied === app.id}
                    label="Copy"
                    onClick={() => void copy(app.id, app.snippet)}
                  />
                </summary>
                <pre className="settings-mcp__snippet" data-testid={`mcp-snippet-${app.id}`}>{app.snippet}</pre>
              </details>
            ))}
            <details className="settings-row settings-row--mcp-app">
              <summary>
                <span>
                  <strong>Add to another app</strong>
                  <p>Any AI tool that supports MCP over HTTP with sign-in can connect.</p>
                </span>
                <CopyButton copied={copied === 'endpoint'} label="Copy URL" onClick={() => void copy('endpoint', endpoint)} />
              </summary>
              <ol className="settings-mcp__steps" data-testid="mcp-other-steps">
                <li>Copy the connection URL.</li>
                <li>In your AI tool, add it as a custom connector or plugin (also called a remote MCP server).</li>
                <li>Approve access in the browser window that opens, using your Whisperer sign-in.</li>
                <li>Start asking your AI about your Notetaker meetings.</li>
              </ol>
            </details>
          </div>

          <p className="settings-mcp__footnote">
            Access is tied to your account on this server. Revoke it any time from your identity provider
            or by signing out of the AI app.
          </p>
        </>
      )}
    </div>
  )
}

/** Compact copy action that briefly confirms success in place. */
function CopyButton({ copied, label, onClick }: { copied: boolean; label: string; onClick: () => void }): ReactElement {
  return (
    <button
      aria-live="polite"
      className="settings-row-button settings-mcp__copy"
      onClick={(event) => {
        // Inside a <summary>, a click would also toggle the disclosure.
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      type="button"
    >
      {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      {copied ? 'Copied' : label}
    </button>
  )
}
