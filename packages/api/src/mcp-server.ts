import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from './db'
import { type Script, scripts } from './db/schema'
import { executeScript } from './execute'
import { McpUnavailableError, toFunctionName, withMcpClient } from './mcp'
import { scriptFields } from './script-fields'

function toJson(script: Script) {
  return {
    ...script,
    createdAt: script.createdAt.toISOString(),
    updatedAt: script.updatedAt.toISOString(),
  }
}

/** Returns `value` as both structured content and JSON text. */
function ok(value: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  }
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

const notFound = () => fail('Script not found')

/** Reports an unreachable upstream MCP server as a tool error. */
async function upstream(fn: () => Promise<CallToolResult>) {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof McpUnavailableError) {
      return fail(error.message)
    }
    throw error
  }
}

const id = z.uuid().describe('Script ID')

/** The API's operations, exposed as MCP tools. */
function createMcpServer() {
  const server = new McpServer({ name: 'template-api', version: '0.0.0' })

  server.registerTool(
    'get_stats',
    {
      description: 'Read API runtime stats',
      annotations: { readOnlyHint: true },
    },
    () =>
      ok({
        region: process.env.REGION ?? 'local',
        uptimeMode: 'long-lived Node process',
        features: ['Hono API', 'Drizzle', 'Run SDK', 'MCP tools'],
      }),
  )

  server.registerTool(
    'list_script_tools',
    {
      description:
        'List the tools on the upstream MCP server (`MCP_URL`) that scripts can call as `tools.<functionName>(args)`',
      annotations: { readOnlyHint: true },
    },
    () =>
      upstream(async () => {
        const { tools } = await withMcpClient((client) => client.listTools())

        return ok({
          tools: tools.map((tool) => ({
            name: tool.name,
            functionName: toFunctionName(tool.name),
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        })
      }),
  )

  server.registerTool(
    'list_scripts',
    { description: 'List scripts', annotations: { readOnlyHint: true } },
    async () => {
      const rows = await getDb()
        .select()
        .from(scripts)
        .orderBy(desc(scripts.updatedAt))

      return ok({ scripts: rows.map(toJson) })
    },
  )

  server.registerTool(
    'get_script',
    {
      description: 'Get a script',
      inputSchema: { id },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const [script] = await getDb()
        .select()
        .from(scripts)
        .where(eq(scripts.id, args.id))

      return script ? ok(toJson(script)) : notFound()
    },
  )

  server.registerTool(
    'create_script',
    {
      description: 'Create a script',
      inputSchema: scriptFields,
    },
    async (args) => {
      const [script] = await getDb().insert(scripts).values(args).returning()

      return ok(toJson(script))
    },
  )

  server.registerTool(
    'update_script',
    {
      description: 'Update a script',
      inputSchema: { id, ...z.object(scriptFields).partial().shape },
      annotations: { idempotentHint: true },
    },
    async ({ id, ...values }) => {
      const [script] = await getDb()
        .update(scripts)
        .set(values)
        .where(eq(scripts.id, id))
        .returning()

      return script ? ok(toJson(script)) : notFound()
    },
  )

  server.registerTool(
    'delete_script',
    {
      description: 'Delete a script',
      inputSchema: { id },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (args) => {
      const [script] = await getDb()
        .delete(scripts)
        .where(eq(scripts.id, args.id))
        .returning({ id: scripts.id })

      return script ? ok({ id: script.id }) : notFound()
    },
  )

  server.registerTool(
    'execute_script',
    {
      description:
        'Run a script in the `run` QuickJS sandbox. Every tool on the upstream MCP server (`MCP_URL`) is available as `tools.<functionName>(args)`.',
      inputSchema: { id },
      annotations: { openWorldHint: true },
    },
    async (args, extra) => {
      const [script] = await getDb()
        .select()
        .from(scripts)
        .where(eq(scripts.id, args.id))

      if (!script) {
        return notFound()
      }

      return upstream(async () => {
        const result = await executeScript(script.source, extra.signal)

        return result.ok
          ? ok({ value: result.value })
          : fail(`${result.error.code}: ${result.error.message}`)
      })
    },
  )

  return server
}

/**
 * Handles a Streamable HTTP MCP request. Stateless: every request gets a fresh
 * server and transport, so nothing has to be kept between requests.
 */
export async function handleMcpRequest(request: Request) {
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  await server.connect(transport)

  return transport.handleRequest(request)
}
