import './env.ts'

import { serve } from '@hono/node-server'
import { apiBasePath, app, mcpPath } from '@template/api'

const hostname = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`API listening on http://${hostname}:${info.port}${apiBasePath}`)
  console.log(`MCP server on http://${hostname}:${info.port}${mcpPath}`)
})
