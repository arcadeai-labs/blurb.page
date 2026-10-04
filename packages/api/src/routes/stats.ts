import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

const statsResponseSchema = z
  .object({
    region: z.string().openapi({ example: 'local' }),
    uptimeMode: z.string().openapi({ example: 'long-lived Node process' }),
    features: z.array(z.string()).openapi({
      example: ['Hono API', 'Drizzle', 'Run SDK', 'MCP tools'],
    }),
  })
  .openapi('StatsResponse')

const statsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'Read API runtime stats',
  responses: {
    200: {
      description: 'Runtime metadata',
      content: {
        'application/json': {
          schema: statsResponseSchema,
        },
      },
    },
  },
})

export const statsRoutes = new OpenAPIHono().openapi(statsRoute, (c) => {
  return c.json(
    {
      region: process.env.REGION ?? 'local',
      uptimeMode: 'long-lived Node process',
      features: ['Hono API', 'Drizzle', 'Run SDK', 'MCP tools'],
    },
    200,
  )
})
