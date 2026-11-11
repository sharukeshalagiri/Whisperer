/**
 * Pure helpers for the Settings MCP section: the endpoint users connect their AI
 * app to, and the ready-to-paste connection snippets for each supported app.
 */

/** Path the API serves the Streamable HTTP MCP endpoint on. */
export const MCP_PATH = '/mcp'

/** Name the connection is registered under in the user's AI app. */
export const MCP_SERVER_NAME = 'whisperer'

/** Builds the public MCP endpoint from the saved server URL, or null when none is saved. */
export function mcpEndpoint(apiHost: string | null): string | null {
  if (!apiHost) return null
  try {
    const url = new URL(apiHost)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.pathname = `${url.pathname.replace(/\/+$/, '')}${MCP_PATH}`
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export type McpAppId = 'claude' | 'codex' | 'cursor' | 'gemini'

export interface McpAppSnippet {
  id: McpAppId
  /** Product name shown on the quick option. */
  label: string
  /** One line saying what the user does with the snippet. */
  hint: string
  /** Text copied to the clipboard; a shell command or a config fragment. */
  snippet: string
  /** Whether the snippet is a shell command rather than a config file fragment. */
  kind: 'command' | 'config'
}

/** Returns the copyable connection snippet for each supported AI app. */
export function mcpAppSnippets(endpoint: string): readonly McpAppSnippet[] {
  const cursorConfig = JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { url: endpoint } } }, null, 2)
  const geminiConfig = JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { httpUrl: endpoint } } }, null, 2)
  return [
    {
      id: 'claude',
      label: 'Claude',
      hint: 'Run in a terminal, then type /mcp in Claude Code to sign in.',
      snippet: `claude mcp add --transport http ${MCP_SERVER_NAME} ${endpoint}`,
      kind: 'command',
    },
    {
      id: 'codex',
      label: 'Codex',
      hint: 'Run in a terminal, then sign in when Codex asks.',
      snippet: `codex mcp add ${MCP_SERVER_NAME} --url ${endpoint}`,
      kind: 'command',
    },
    {
      id: 'cursor',
      label: 'Cursor',
      hint: 'Paste into ~/.cursor/mcp.json, then approve access in the browser.',
      snippet: cursorConfig,
      kind: 'config',
    },
    {
      id: 'gemini',
      label: 'Gemini CLI',
      hint: 'Paste into ~/.gemini/settings.json, then run /mcp auth whisperer.',
      snippet: geminiConfig,
      kind: 'config',
    },
  ]
}
