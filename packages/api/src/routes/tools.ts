import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import type { AuthEnv } from '../auth/routes'
import {
  listAllTools,
  McpUnavailableError,
  toFunctionName,
  withMcpClient,
} from '../mcp'
import { gatewayTools } from '../toolkits'

const toolSchema = z
  .object({
    name: z.string().openapi({ example: 'Gmail.ListEmails' }),
    functionName: z.string().openapi({
      description: 'Call it from a script as `tools.<functionName>(args)`',
      example: 'Gmail_ListEmails',
    }),
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.unknown()),
  })
  .openapi('Tool')

const listToolsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List the MCP tools available to scripts',
  responses: {
    200: {
      description: "Tools on the user's MCP gateway",
      content: { 'application/json': { schema: z.array(toolSchema) } },
    },
    503: {
      description: 'The MCP server is not configured or unreachable',
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
    },
  },
})

const listToolNamesRoute = createRoute({
  method: 'get',
  path: '/names',
  summary: 'List the function names of the MCP tools available to scripts',
  description:
    "Just the names, kept for a couple of minutes: what the UI checks apps' and scripts' tools against.",
  responses: {
    200: {
      description:
        "Function names of the tools on the user's MCP gateway; null when it couldn't be reached",
      content: {
        'application/json': {
          schema: z.object({
            functionNames: z
              .array(z.string())
              .nullable()
              .openapi({ example: ['Gmail_ListEmails'] }),
          }),
        },
      },
    },
  },
})

export const toolsRoutes = new OpenAPIHono<AuthEnv>()
  .openapi(listToolNamesRoute, async (c) =>
    c.json(
      {
        functionNames: await gatewayTools(
          c.var.user.id,
          await c.var.mcpConnection(),
        ),
      },
      200,
    ),
  )
  .openapi(listToolsRoute, async (c) => {
    try {
      const tools = await withMcpClient(
        await c.var.mcpConnection(),
        listAllTools,
      )

      return c.json(
        tools.map((tool) => ({
          name: tool.name,
          functionName: toFunctionName(tool.name),
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
        200,
      )
    } catch (error) {
      if (error instanceof McpUnavailableError) {
        return c.json({ error: error.message }, 503)
      }
      throw error
    }
  })
