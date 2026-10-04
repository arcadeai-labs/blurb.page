import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'

import { statsRoutes } from './routes/stats'

/** Path the API is mounted at, by both `apps/server` and `apps/frontend`. */
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
  .get('/', swaggerUI({ url: `${apiBasePath}/openapi.json` }))
  .use('/stats', cors())
  .route('/stats', statsRoutes)

export type AppType = typeof api

/** The API mounted at `/api`, ready to be used as a Worker fetch handler. */
export const app = new OpenAPIHono().route(apiBasePath, api)

export default app
