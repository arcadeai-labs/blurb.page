import { app } from '@template/api'
import { createFileRoute } from '@tanstack/react-router'

// The Hono API (`packages/api`) is served by this server, under `/api`.
export const Route = createFileRoute('/api/$')({
  server: { handlers: { ANY: ({ request }) => app.fetch(request) } },
})
