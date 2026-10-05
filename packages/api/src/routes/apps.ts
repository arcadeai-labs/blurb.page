import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import type { AuthEnv } from '../auth/routes'
import { appToolkits, gatewayTools } from '../toolkits'

/** A toolkit or MCP server, with the tools an app or script calls from it. */
export const appToolkitSchema = z
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

export const appsRoutes = new OpenAPIHono<AuthEnv>().openapi(
  listToolkitsRoute,
  async (c) =>
    c.json(
      await appToolkits(await gatewayTools(await c.var.mcpConnection())),
      200,
    ),
)
