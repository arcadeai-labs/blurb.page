import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import type { AuthEnv } from '../auth/routes'
import {
  listAllTools,
  McpUnavailableError,
  toFunctionName,
  withMcpClient,
} from '../mcp'
import { appToolkits } from '../toolkits'

const appToolkitSchema = z
  .object({
    name: z.string().openapi({ example: 'Gmail' }),
    label: z.string().openapi({ example: 'Gmail' }),
    iconUrl: z
      .url()
      .nullable()
      .openapi({ example: 'https://design-system.arcade.dev/icons/gmail.svg' }),
    source: z.enum(['arcade', 'mcp']).openapi({
      description:
        'An Arcade toolkit, or a custom MCP server (anything not in Arcade’s catalog)',
    }),
    tools: z.array(
      z.object({
        name: z.string().openapi({ example: 'ListEmails' }),
        functionName: z.string().openapi({ example: 'Gmail_ListEmails' }),
        available: z.boolean().nullable().openapi({
          description:
            "Whether the user's gateway has the tool; null when it couldn't be reached",
        }),
      }),
    ),
  })
  .openapi('AppToolkit')

const listToolkitsRoute = createRoute({
  method: 'get',
  path: '/toolkits',
  summary: 'List the toolkits and MCP servers each app needs',
  responses: {
    200: {
      description:
        "Every app's toolkits, with the tools its scripts call from each",
      content: {
        'application/json': {
          schema: z.array(
            z.object({ name: z.string(), toolkits: z.array(appToolkitSchema) }),
          ),
        },
      },
    },
  },
})

/** Function names of the tools on the user's gateway, or `null` if it's unreachable. */
async function gatewayTools(connection: Parameters<typeof withMcpClient>[0]) {
  try {
    const tools = await withMcpClient(connection, listAllTools)
    return new Set(tools.map((tool) => toFunctionName(tool.name)))
  } catch (error) {
    if (error instanceof McpUnavailableError) {
      return null
    }
    throw error
  }
}

export const appsRoutes = new OpenAPIHono<AuthEnv>().openapi(
  listToolkitsRoute,
  async (c) =>
    c.json(
      await appToolkits(await gatewayTools(await c.var.mcpConnection())),
      200,
    ),
)
