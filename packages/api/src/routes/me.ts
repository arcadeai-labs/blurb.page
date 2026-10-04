import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import type { AuthEnv } from '../auth/routes'

const userSchema = z
  .object({
    id: z.string(),
    email: z.email(),
    name: z.string(),
  })
  .openapi('User')

const meRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'The signed-in user',
  responses: {
    200: {
      description: 'The user, signed in with their Arcade account',
      content: { 'application/json': { schema: userSchema } },
    },
    401: {
      description: 'Nobody is signed in',
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
    },
  },
})

export const meRoutes = new OpenAPIHono<AuthEnv>().openapi(meRoute, (c) => {
  const { id, email, name } = c.var.user

  return c.json({ id, email, name }, 200)
})
