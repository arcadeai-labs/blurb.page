// The Hono API runs on Node (`apps/server`). In dev, Vite proxies `/api` to it,
// so requests default to the current origin. Set `VITE_API_BASE_URL` to point a
// deployed frontend at the deployed API.
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL

export const apiBaseUrl = (configuredApiBaseUrl ?? '').replace(/\/$/, '')

export const apiDocsUrl = `${apiBaseUrl}/api`
