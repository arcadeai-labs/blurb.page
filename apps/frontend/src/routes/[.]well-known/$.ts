import { app } from '@template/api'
import { createFileRoute } from '@tanstack/react-router'

// OAuth discovery for MCP clients connecting to `/mcp` (`packages/api`).
export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { GET: ({ request }) => app.fetch(request) } },
})
