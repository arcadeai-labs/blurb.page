import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import type { AuthEnv } from '../auth/routes'
import { McpUnavailableError, toFunctionName, withMcpClient } from '../mcp'

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
      description: 'Tools on the MCP server at `MCP_URL`',
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

export const toolsRoutes = new OpenAPIHono<AuthEnv>().openapi(
  listToolsRoute,
  async (c) => {
    try {
      const { tools } = await withMcpClient(
        await c.var.arcadeToken(),
        (client) => client.listTools(),
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
  },
)
