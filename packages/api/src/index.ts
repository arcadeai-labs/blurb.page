import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'

import { AccountNotConnectedError, SignInRequiredError } from './auth'
import {
  type AuthEnv,
  authRoutes,
  requireUser,
  wellKnownRoutes,
} from './auth/routes'
import { ArcadeApiError } from './gateways'
import { handleMcpRequest } from './mcp-server'
import { meRoutes } from './routes/me'
import { organizationsRoutes } from './routes/organizations'
import { scriptsRoutes } from './routes/scripts'
import { statsRoutes } from './routes/stats'
import { svgsRoutes } from './routes/svgs'
import { toolsRoutes } from './routes/tools'

/** Path the API is mounted at by `apps/frontend`. */
export const apiBasePath = '/api'

export const api = new OpenAPIHono<AuthEnv>()
  .doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Template API',
      version: '0.0.0',
    },
    servers: [{ url: apiBasePath }],
  })
  .use('*', cors())
  .get('/', swaggerUI({ url: `${apiBasePath}/openapi.json` }))
  .route('/', authRoutes)
  // Everything below needs a signed-in user.
  .use('*', requireUser)
  .route('/me', meRoutes)
  .route('/organizations', organizationsRoutes)
  .route('/stats', statsRoutes)
  .route('/scripts', scriptsRoutes)
  .route('/svgs', svgsRoutes)
  .route('/tools', toolsRoutes)

api.onError((error, c) => {
  if (error instanceof SignInRequiredError) {
    return c.json({ error: error.message }, 401)
  }
  if (error instanceof AccountNotConnectedError) {
    return c.json({ error: error.message }, 403)
  }
  if (error instanceof ArcadeApiError) {
    // Arcade's own 403 and 404 mean the same here; anything else is upstream.
    return c.json(
      { error: error.message },
      error.status === 403 || error.status === 404 ? error.status : 502,
    )
  }
  throw error
})

export type AppType = typeof api

/** Path of the Streamable HTTP MCP server exposing the API as tools. */
export const mcpPath = '/mcp'

/**
 * The API mounted at `/api`, its MCP server at `/mcp`, and the OAuth
 * discovery documents MCP clients find it through.
 */
export const app = new OpenAPIHono()
  .route(apiBasePath, api)
  .route('/', wellKnownRoutes)
  .use(
    mcpPath,
    cors({
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'Mcp-Session-Id',
        'Mcp-Protocol-Version',
      ],
      exposeHeaders: [
        'Mcp-Session-Id',
        'Mcp-Protocol-Version',
        'WWW-Authenticate',
      ],
    }),
  )
  .all(mcpPath, (c) => handleMcpRequest(c.req.raw))

export default app
