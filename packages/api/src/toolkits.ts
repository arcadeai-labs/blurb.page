// The toolkits and MCP servers each app (and script) needs on the user's
// gateway: the tools its scripts call, grouped by the toolkit (or custom MCP server) they
// belong to, with Arcade's icon for it. Which of those tools the gateway has
// comes separately (`gatewayTools`), since listing a large gateway takes seconds.
import { z } from 'zod'

import { getDb } from './db'
import { apps, scripts } from './db/schema'
import {
  listAllTools,
  type McpConnection,
  McpUnavailableError,
  toFunctionName,
  withMcpClient,
} from './mcp'
import { referencedScripts } from './ui/validate'

/**
 * Arcade's catalog of its toolkits, with their icons: the metadata its
 * dashboard and docs render toolkits with. Custom MCP servers aren't in it.
 */
const toolkitMetadataUrl =
  'https://design-system.arcade.dev/metadata/toolkits.json'

const toolkitMetadataSchema = z.array(
  z.object({ id: z.string(), label: z.string(), publicIconUrl: z.url() }),
)

type ToolkitMetadata = z.infer<typeof toolkitMetadataSchema>[number]

const metadataMaxAgeMs = 60 * 60 * 1000

let metadata:
  | { fetchedAt: number; toolkits: Promise<ToolkitMetadata[]> }
  | undefined

/**
 * Arcade's toolkit metadata, refreshed hourly. Icons are decoration, so a
 * failed fetch gives no metadata (and is retried on the next call).
 */
function toolkitMetadata() {
  if (!metadata || Date.now() - metadata.fetchedAt > metadataMaxAgeMs) {
    const toolkits = (async () => {
      const response = await fetch(toolkitMetadataUrl, {
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        throw new Error(
          `Could not load Arcade's toolkit metadata (${response.status})`,
        )
      }

      return toolkitMetadataSchema.parse(await response.json())
    })().catch((error: unknown) => {
      console.warn(error)
      metadata = undefined
      return []
    })

    metadata = { fetchedAt: Date.now(), toolkits }
  }

  return metadata.toolkits
}

/** `tools.Gmail_ListEmails(…)`, `tools['Gmail_ListEmails'](…)` */
const toolCallPattern =
  /(?<![\w$.])tools\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*(['"`])([^'"`]+)\2\s*\])/g

/** The function names of the tools a script's source calls. */
export function calledTools(source: string) {
  const names = new Set<string>()

  for (const match of source.matchAll(toolCallPattern)) {
    names.add(match[1] ?? match[3])
  }

  return names
}

/**
 * Arcade gateways name tools `<Toolkit>_<Tool>`, and toolkit names (custom
 * MCP servers' too) have no underscores, so the first one splits them. The
 * engine files tools of nameless servers under `Tools` too.
 */
function splitFunctionName(functionName: string) {
  const separator = functionName.indexOf('_')

  return separator > 0
    ? {
        toolkit: functionName.slice(0, separator),
        tool: functionName.slice(separator + 1),
      }
    : { toolkit: 'Tools', tool: functionName }
}

export type AppToolkit = {
  name: string
  label: string
  iconUrl: string | null
  /** In Arcade's catalog, or else a custom MCP server. */
  source: 'arcade' | 'mcp'
  tools: { name: string; functionName: string }[]
}

/** Arcade's catalog by lowercased toolkit ID and label. */
async function catalogByName() {
  // Matched like the dashboard does: case-insensitively, by ID or label.
  const byName = new Map<string, ToolkitMetadata>()
  for (const toolkit of await toolkitMetadata()) {
    byName.set(toolkit.id.toLowerCase(), toolkit)
    byName.set(toolkit.label.toLowerCase(), toolkit)
  }
  return byName
}

/** Groups tool function names by the toolkit (or MCP server) they belong to. */
function groupByToolkit(
  functionNames: Iterable<string>,
  catalog: Map<string, ToolkitMetadata>,
) {
  const toolkits = new Map<string, AppToolkit>()
  for (const functionName of [...new Set(functionNames)].sort()) {
    const { toolkit: name, tool } = splitFunctionName(functionName)
    let toolkit = toolkits.get(name)

    if (!toolkit) {
      const metadata = catalog.get(name.toLowerCase())
      toolkit = {
        name,
        label: metadata?.label ?? name,
        iconUrl: metadata?.publicIconUrl ?? null,
        source: metadata ? 'arcade' : 'mcp',
        tools: [],
      }
      toolkits.set(name, toolkit)
    }

    toolkit.tools.push({ name: tool, functionName })
  }

  return [...toolkits.values()]
}

/** The toolkits every app's scripts call tools of. */
export async function appToolkits() {
  const [appRows, scriptRows, catalog] = await Promise.all([
    getDb().select().from(apps),
    getDb()
      .select({ name: scripts.name, source: scripts.source })
      .from(scripts),
    catalogByName(),
  ])

  const toolsByScript = new Map(
    scriptRows.map((script) => [script.name, calledTools(script.source)]),
  )

  return appRows.map((app) => ({
    name: app.name,
    toolkits: groupByToolkit(
      [...referencedScripts(app)].flatMap((script) => [
        ...(toolsByScript.get(script) ?? []),
      ]),
      catalog,
    ),
  }))
}

/** The toolkits each script calls tools of. */
export async function scriptToolkits() {
  const [scriptRows, catalog] = await Promise.all([
    getDb().select({ id: scripts.id, source: scripts.source }).from(scripts),
    catalogByName(),
  ])

  return scriptRows.map((script) => ({
    id: script.id,
    toolkits: groupByToolkit(calledTools(script.source), catalog),
  }))
}

const gatewayToolsMaxAgeMs = 2 * 60 * 1000

/** Each user's gateway tools, by user ID and gateway URL. */
const gatewayToolsCache = new Map<
  string,
  { fetchedAt: number; functionNames: Promise<string[] | null> }
>()

/**
 * Function names of the tools on the user's gateway, or `null` if it's
 * unreachable. Listing a large gateway takes seconds (a request per 100
 * tools), so the list is kept for a couple of minutes per user and gateway;
 * switching gateways changes the URL, so it doesn't serve the old one's.
 */
export function gatewayTools(userId: string, connection: McpConnection) {
  const key = `${userId} ${connection.url}`
  const now = Date.now()

  for (const [cachedKey, cached] of gatewayToolsCache) {
    if (now - cached.fetchedAt > gatewayToolsMaxAgeMs) {
      gatewayToolsCache.delete(cachedKey)
    }
  }

  const cached = gatewayToolsCache.get(key)
  if (cached) {
    return cached.functionNames
  }

  const functionNames = withMcpClient(connection, listAllTools).then(
    (tools) => tools.map((tool) => toFunctionName(tool.name)),
    (error: unknown) => {
      // Failures aren't kept, so the next request tries again.
      gatewayToolsCache.delete(key)
      if (error instanceof McpUnavailableError) {
        return null
      }
      throw error
    },
  )

  gatewayToolsCache.set(key, { fetchedAt: now, functionNames })
  return functionNames
}
