// The Hono API is mounted on this Worker at `/api` (see `src/server.ts`), so
// requests default to the current origin. Set `VITE_API_BASE_URL` to point at a
// separately deployed API instead (for example `apps/server`).
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL

export const apiBaseUrl = (configuredApiBaseUrl ?? '').replace(/\/$/, '')

export const apiDocsUrl = `${apiBaseUrl}/api`
