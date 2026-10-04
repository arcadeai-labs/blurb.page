import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'

import { scriptsRoutes } from './routes/scripts'
import { statsRoutes } from './routes/stats'
import { toolsRoutes } from './routes/tools'

/** Path the API is mounted at by `apps/server`. */
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

/** The API mounted at `/api`, ready to be served by `@hono/node-server`. */
export const app = new OpenAPIHono().route(apiBasePath, api)

export default app
