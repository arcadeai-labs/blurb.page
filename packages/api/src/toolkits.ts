// The toolkits and MCP servers each app needs on the user's gateway: the
// tools its scripts call, grouped by the toolkit (or custom MCP server) they
// belong to, with Arcade's icon for it.
import { z } from 'zod'

import { getDb } from './db'
import { apps, scripts } from './db/schema'
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
  tools: {
    name: string
    functionName: string
    /** On the user's gateway; `null` when it couldn't be listed. */
    available: boolean | null
  }[]
}

/**
 * The toolkits every app's scripts call tools of. `gatewayTools` holds the
 * function names of the tools on the user's gateway, or `null` if unknown.
 */
export async function appToolkits(gatewayTools: Set<string> | null) {
  const [appRows, scriptRows, catalog] = await Promise.all([
    getDb().select().from(apps),
    getDb()
      .select({ name: scripts.name, source: scripts.source })
      .from(scripts),
    toolkitMetadata(),
  ])

  const toolsByScript = new Map(
    scriptRows.map((script) => [script.name, calledTools(script.source)]),
  )
  // Matched like the dashboard does: case-insensitively, by ID or label.
  const catalogByName = new Map<string, ToolkitMetadata>()
  for (const toolkit of catalog) {
    catalogByName.set(toolkit.id.toLowerCase(), toolkit)
    catalogByName.set(toolkit.label.toLowerCase(), toolkit)
  }

  return appRows.map((app) => {
    const functionNames = new Set<string>()
    for (const script of referencedScripts(app)) {
      for (const name of toolsByScript.get(script) ?? []) {
        functionNames.add(name)
      }
    }

    const toolkits = new Map<string, AppToolkit>()
    for (const functionName of [...functionNames].sort()) {
      const { toolkit: name, tool } = splitFunctionName(functionName)
      let toolkit = toolkits.get(name)

      if (!toolkit) {
        const metadata = catalogByName.get(name.toLowerCase())
        toolkit = {
          name,
          label: metadata?.label ?? name,
          iconUrl: metadata?.publicIconUrl ?? null,
          source: metadata ? 'arcade' : 'mcp',
          tools: [],
        }
        toolkits.set(name, toolkit)
      }

      toolkit.tools.push({
        name: tool,
        functionName,
        available: gatewayTools ? gatewayTools.has(functionName) : null,
      })
    }

    return { name: app.name, toolkits: [...toolkits.values()] }
  })
}
