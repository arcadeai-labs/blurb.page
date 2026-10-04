import { app } from '@template/api'
import { createFileRoute } from '@tanstack/react-router'

// The API's MCP server (`packages/api`), which agents and this app talk to.
export const Route = createFileRoute('/mcp')({
  server: { handlers: { ANY: ({ request }) => app.fetch(request) } },
})
