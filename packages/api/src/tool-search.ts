// Finds the integration tools on the user's gateway that fit a task, so
// scripts get written against a few tools instead of the gateway's whole
// catalog. Arcade's tool search does the ranking today; callers only see
// `searchTools`, so another backend can replace it without changing them.
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { z } from 'zod'

import {
  listAllTools,
  type McpConnection,
  toFunctionName,
  withMcpClient,
} from './mcp'

/** A tool that fits a task. */
export type ToolMatch = {
  name: string
  /** Call it from a script as `tools.<functionName>(args)`. */
  functionName: string
  description: string
  inputSchema: Record<string, unknown>
  /** How well it fits, from 0 to 1. */
  score: number
}

/** The tools that fit one task, best first. */
export type TaskMatches = { task: string; tools: ToolMatch[] }

/** Ranks the tools on the user's gateway for each task. */
export type ToolSearchBackend = (
  connection: McpConnection,
  tasks: string[],
) => Promise<TaskMatches[]>

/** At most this many tools per task. */
const maxMatches = 10

/**
 * Searches any MCP server: lists all its tools and ranks them by the share of
 * the task's words in their name and description. Slow on large gateways
 * (it reads every page of `tools/list`), so it's only the fallback.
 */
export const catalogSearch: ToolSearchBackend = (connection, tasks) =>
  withMcpClient(connection, async (client) =>
    rankTools(await listAllTools(client), tasks),
  )

function words(text: string) {
  return new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g))
}

/** Splits `ListEmails` and `Gmail.ListEmails` into words too. */
function toolWords(tool: { name: string; description?: string }) {
  const name = tool.name.replace(/([a-z])([A-Z])/g, '$1 $2')
  return words(`${name} ${tool.description ?? ''}`)
}

function rankTools(
  tools: Awaited<ReturnType<typeof listAllTools>>,
  tasks: string[],
) {
  const indexed = tools.map((tool) => ({ tool, words: toolWords(tool) }))

  return tasks.map((task) => {
    const taskWords = [...words(task)]

    return {
      task,
      tools: indexed
        .map(({ tool, words }) => ({
          name: tool.name,
          functionName: toFunctionName(tool.name),
          description: tool.description ?? '',
          inputSchema: tool.inputSchema,
          score:
            taskWords.filter((word) => words.has(word)).length /
            Math.max(taskWords.length, 1),
        }))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxMatches),
    }
  })
}

/** Arcade's search tool, on gateways in discovery mode. */
const arcadeSearchTool = 'Arcade_SelectTools'

const arcadeSearchResult = z.object({
  results: z.array(
    z.object({
      task: z.string(),
      suggestions: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          input_schema: z.record(z.string(), z.unknown()),
          score: z.number(),
        }),
      ),
    }),
  ),
})

/** Arcade's tool search result, from structured content or JSON text. */
function arcadeResultOf(result: Awaited<ReturnType<Client['callTool']>>) {
  if (result.structuredContent !== undefined) {
    return arcadeSearchResult.parse(result.structuredContent)
  }

  const content = Array.isArray(result.content) ? result.content : []
  const text = content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')

  return arcadeSearchResult.parse(JSON.parse(text))
}

/**
 * Arcade's tool search (`Arcade_SelectTools`), which ranks the gateway's tools
 * semantically. Gateways that don't offer it fall back to
 * {@link catalogSearch}.
 */
export const arcadeSearch: ToolSearchBackend = async (connection, tasks) => {
  const matches = await withMcpClient(
    connection,
    async (client) => {
      // In discovery mode this is one short page: Arcade's meta-tools.
      const { tools } = await client.listTools()

      if (!tools.some((tool) => tool.name === arcadeSearchTool)) {
        return null
      }

      const result = await client.callTool({
        name: arcadeSearchTool,
        arguments: { tasks },
      })

      if (result.isError) {
        return null
      }

      return arcadeResultOf(result).results.map(({ task, suggestions }) => ({
        task,
        tools: suggestions.slice(0, maxMatches).map((tool) => ({
          // Arcade names tools `Gmail.ListEmails` here, and `Gmail_ListEmails`
          // when listing them; both give the same function name.
          name: tool.name,
          functionName: toFunctionName(tool.name),
          description: tool.description ?? '',
          inputSchema: tool.input_schema,
          score: tool.score,
        })),
      }))
    },
    { toolRecommendation: true },
  )

  return matches ?? catalogSearch(connection, tasks)
}

/** The backend {@link searchTools} uses. */
const backend: ToolSearchBackend = arcadeSearch

/**
 * The tools on the user's gateway (`connection`) that fit each task, best
 * first: one entry per task, in order.
 */
export function searchTools(connection: McpConnection, tasks: string[]) {
  return backend(connection, tasks)
}
