import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'

import { handleMcpRequest } from './mcp-server'
import { scriptsRoutes } from './routes/scripts'
import { statsRoutes } from './routes/stats'
import { toolsRoutes } from './routes/tools'

/** Path the API is mounted at by `apps/frontend`. */
export const apiBasePath = '/api'

export const api = new OpenAPIHono()
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
  .route('/stats', statsRoutes)
  .route('/scripts', scriptsRoutes)
  .route('/tools', toolsRoutes)

export type AppType = typeof api

/** Path of the Streamable HTTP MCP server exposing the API as tools. */
export const mcpPath = '/mcp'

/** The API mounted at `/api` and its MCP server at `/mcp`. */
export const app = new OpenAPIHono()
  .route(apiBasePath, api)
  .use(
    mcpPath,
    cors({
      allowHeaders: ['Content-Type', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
      exposeHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
    }),
  )
  .all(mcpPath, (c) => handleMcpRequest(c.req.raw))

export default app
