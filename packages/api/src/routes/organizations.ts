import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import type { AuthEnv } from '../auth/routes'
import { listGateways, listOrganizations, listProjects } from '../gateways'

const errorSchema = z.object({ error: z.string() }).openapi('Error')

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const notConnected = json(
  errorSchema,
  "The user's Arcade account isn't connected",
)

const organizationSchema = z
  .object({ id: z.string(), name: z.string(), isDefault: z.boolean() })
  .openapi('Organization')

const projectSchema = z
  .object({ id: z.string(), name: z.string(), isDefault: z.boolean() })
  .openapi('Project')

const gatewaySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    url: z.url(),
    usable: z
      .boolean()
      .describe(
        'Whether it signs users in with Arcade, so it can run tools as them',
      ),
  })
  .openapi('Gateway')

const organizationParams = z.object({
  organizationId: z
    .string()
    .openapi({ param: { name: 'organizationId', in: 'path' } }),
})

const projectParams = organizationParams.extend({
  projectId: z.string().openapi({ param: { name: 'projectId', in: 'path' } }),
})

const listOrganizationsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: "The user's Arcade organizations",
  responses: {
    200: json(z.array(organizationSchema), 'Organizations'),
    403: notConnected,
  },
})

const listProjectsRoute = createRoute({
  method: 'get',
  path: '/{organizationId}/projects',
  summary: 'The projects in an organization the user can access',
  request: { params: organizationParams },
  responses: {
    200: json(z.array(projectSchema), 'Projects'),
    403: notConnected,
  },
})

const listGatewaysRoute = createRoute({
  method: 'get',
  path: '/{organizationId}/projects/{projectId}/gateways',
  summary: "A project's MCP gateways",
  request: { params: projectParams },
  responses: {
    200: json(z.array(gatewaySchema), 'Gateways'),
    403: notConnected,
  },
})

// Read from Arcade with the user's identity-provider token, so they only see
// what the dashboard would show them.
export const organizationsRoutes = new OpenAPIHono<AuthEnv>()
  .openapi(listOrganizationsRoute, async (c) =>
    c.json(await listOrganizations(await c.var.identityToken()), 200),
  )
  .openapi(listProjectsRoute, async (c) =>
    c.json(
      await listProjects(
        await c.var.identityToken(),
        c.req.valid('param').organizationId,
      ),
      200,
    ),
  )
  .openapi(listGatewaysRoute, async (c) => {
    const { organizationId, projectId } = c.req.valid('param')

    return c.json(
      await listGateways(
        await c.var.identityToken(),
        organizationId,
        projectId,
      ),
      200,
    )
  })
