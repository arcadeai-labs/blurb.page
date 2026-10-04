import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Key of the API's MCP server in `.mcp.json`. */
const MCP_SERVER_NAME = 'blurb-page'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The URL MCP clients reach the API's MCP server at (`/mcp`, see
 * `packages/api`). It's the plain loopback address rather than the portless
 * HTTPS route, because Node-based clients don't trust the portless CA.
 */
export function localMcpUrl(host: string, port: number) {
  const reachableHost = ['0.0.0.0', '::', '[::]'].includes(host)
    ? '127.0.0.1'
    : host

  return `http://${reachableHost}:${port}/mcp`
}

/**
 * Points the repo's `.mcp.json` at `url`, keeping any other servers in it.
 * Returns whether the file changed.
 */
export function writeMcpConfig(repoRoot: string, url: string): boolean {
  const path = join(repoRoot, '.mcp.json')
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '{}'
  let config: unknown

  try {
    config = JSON.parse(current)
  } catch {
    console.warn(`  Not updating ${path}: it isn't valid JSON`)
    return false
  }

  const root = isRecord(config) ? config : {}
  const servers = isRecord(root.mcpServers) ? root.mcpServers : {}
  const next = `${JSON.stringify(
    {
      ...root,
      mcpServers: { ...servers, [MCP_SERVER_NAME]: { type: 'http', url } },
    },
    null,
    2,
  )}\n`

  if (next === current) {
    return false
  }

  writeFileSync(path, next)
  return true
}
