import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import { findAccount } from '../auth'
import { identityClient } from '../auth/arcade'
import type { AuthEnv } from '../auth/routes'
import {
  clearUserGateway,
  defaultGatewayUrl,
  getGateway,
  setUserGateway,
  userGateway,
} from '../gateways'

const errorSchema = z.object({ error: z.string() }).openapi('Error')

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const signedOut = json(errorSchema, 'Nobody is signed in')

const gatewayChoiceSchema = z
  .object({
    organizationId: z.string(),
    projectId: z.string(),
    gatewayId: z.string(),
  })
  .openapi('GatewayChoice')

const userGatewaySchema = gatewayChoiceSchema
  .extend({ name: z.string(), url: z.url() })
  .openapi('UserGateway')

const userSchema = z
  .object({
    id: z.string(),
    email: z.email(),
    name: z.string(),
    account: z
      .object({
        available: z.boolean(),
        connected: z.boolean(),
      })
      .describe(
        "The user's Arcade account (the dashboard's sign-in), which lists their gateways. Not `available` when the server has no client for it.",
      ),
    gateway: userGatewaySchema
      .nullable()
      .describe('The gateway the user picked; `null` for the default'),
    defaultGatewayUrl: z.url(),
  })
  .openapi('User')

const meRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'The signed-in user, and the gateway their tool calls go to',
  responses: { 200: json(userSchema, 'The user'), 401: signedOut },
})

const setGatewayRoute = createRoute({
  method: 'put',
  path: '/gateway',
  summary: "Send the user's tool calls to one of their gateways",
  request: {
    body: { content: { 'application/json': { schema: gatewayChoiceSchema } } },
  },
  responses: {
    200: json(userGatewaySchema, 'The gateway'),
    400: json(errorSchema, "The gateway doesn't sign users in with Arcade"),
    401: signedOut,
    403: json(errorSchema, "The user's Arcade account isn't connected"),
  },
})

const clearGatewayRoute = createRoute({
  method: 'delete',
  path: '/gateway',
  summary: "Send the user's tool calls to the default gateway",
  responses: { 204: { description: 'Cleared' }, 401: signedOut },
})

export const meRoutes = new OpenAPIHono<AuthEnv>()
  .openapi(meRoute, async (c) => {
    const { id, email, name } = c.var.user
    const [identity, gateway] = await Promise.all([
      findAccount(id, 'arcade-identity'),
      userGateway(id),
    ])

    return c.json(
      {
        id,
        email,
        name,
        account: {
          available: identityClient() !== null,
          connected: identity !== null,
        },
        gateway: gateway && {
          organizationId: gateway.organizationId,
          projectId: gateway.projectId,
          gatewayId: gateway.gatewayId,
          name: gateway.name,
          url: gateway.url,
        },
        defaultGatewayUrl: defaultGatewayUrl(),
      },
      200,
    )
  })
  .openapi(setGatewayRoute, async (c) => {
    const choice = c.req.valid('json')
    // Looked up as the user, so they can only pick gateways they can read.
    const gateway = await getGateway(
      await c.var.identityToken(),
      choice.organizationId,
      choice.projectId,
      choice.gatewayId,
    )

    if (!gateway.usable) {
      return c.json(
        {
          error:
            "That gateway doesn't sign users in with Arcade, so it can't run tools as you",
        },
        400,
      )
    }

    const picked = { ...choice, name: gateway.name, url: gateway.url }
    await setUserGateway(c.var.user.id, picked)

    return c.json(picked, 200)
  })
  .openapi(clearGatewayRoute, async (c) => {
    await clearUserGateway(c.var.user.id)

    return c.body(null, 204)
  })
