import { describe, expect, it } from 'vitest'

import { mcpAppSnippets, mcpEndpoint } from './mcp-connect'

describe('mcpEndpoint', () => {
  it('appends /mcp to the saved server URL and drops query, hash and trailing slashes', () => {
    expect(mcpEndpoint('https://whisperer.example.test')).toBe('https://whisperer.example.test/mcp')
    expect(mcpEndpoint('https://whisperer.example.test/')).toBe('https://whisperer.example.test/mcp')
    expect(mcpEndpoint('https://whisperer.example.test/api/?x=1#y')).toBe('https://whisperer.example.test/api/mcp')
  })

  it('returns null without a saved server or for a non-HTTP URL', () => {
    expect(mcpEndpoint(null)).toBeNull()
    expect(mcpEndpoint('')).toBeNull()
    expect(mcpEndpoint('not a url')).toBeNull()
    expect(mcpEndpoint('file:///tmp/x')).toBeNull()
  })
})

describe('mcpAppSnippets', () => {
  const endpoint = 'https://whisperer.example.test/mcp'
  const snippets = mcpAppSnippets(endpoint)

  it('offers Claude, Codex, Cursor and Gemini, each carrying the endpoint', () => {
    expect(snippets.map((app) => app.id)).toEqual(['claude', 'codex', 'cursor', 'gemini'])
    for (const app of snippets) expect(app.snippet).toContain(endpoint)
  })

  it('uses the http transport for Claude Code', () => {
    expect(snippets[0]?.snippet).toBe(`claude mcp add --transport http whisperer ${endpoint}`)
  })

  it('emits valid JSON config fragments for Cursor and Gemini', () => {
    const cursor = JSON.parse(snippets[2]?.snippet ?? '') as { mcpServers: { whisperer: { url: string } } }
    const gemini = JSON.parse(snippets[3]?.snippet ?? '') as { mcpServers: { whisperer: { httpUrl: string } } }
    expect(cursor.mcpServers.whisperer.url).toBe(endpoint)
    expect(gemini.mcpServers.whisperer.httpUrl).toBe(endpoint)
  })
})
