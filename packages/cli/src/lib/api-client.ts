import type { AppType } from '@template/api'
import { hc } from 'hono/client'
import { getPortlessRoute } from './portless.ts'
import { trustPortlessCa } from './tls.ts'
import { findRepoRoot } from './workspace.ts'

/**
 * Where the API lives. Explicit `--base-url` wins, then `TEMPLATE_API_BASE_URL`,
 * then the portless URL of the frontend, which mounts the same Hono app.
 */
export function resolveBaseUrl(explicit?: string): string {
  const configured = explicit ?? process.env.TEMPLATE_API_BASE_URL

  if (configured) {
    return configured.replace(/\/$/, '')
  }

  return getPortlessRoute('frontend', findRepoRoot() ?? process.cwd()).url
}

export function createApiClient(baseUrl: string) {
  trustPortlessCa()

  return hc<AppType>(`${baseUrl}/api`)
}

export type ApiClient = ReturnType<typeof createApiClient>

class ApiHttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
  }
}

/** portless answers with 404/502 while nothing is listening behind the route. */
const UNREACHABLE_STATUSES = [404, 502, 503, 504]

function unreachableHint(baseUrl: string) {
  return `Could not reach the API at ${baseUrl}. Start it with \`template dev\`, or pass --base-url.`
}

/**
 * Runs an API call with a client for `baseUrl`, replacing the opaque
 * `fetch failed` of a dead dev server with something actionable.
 */
export async function withApi<T>(
  baseUrl: string,
  run: (client: ApiClient) => Promise<T>,
): Promise<T> {
  try {
    return await run(createApiClient(baseUrl))
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(unreachableHint(baseUrl))
    }
    if (
      error instanceof ApiHttpError &&
      UNREACHABLE_STATUSES.includes(error.status)
    ) {
      throw new Error(`${error.message}. ${unreachableHint(baseUrl)}`)
    }
    throw error
  }
}

/** Error bodies are often a proxy's HTML page, so keep only a readable gist. */
function summarize(body: string) {
  const text = body.replace(/\s+/g, ' ').trim()

  if (!text) {
    return ''
  }

  return `: ${text.length > 160 ? `${text.slice(0, 160)}…` : text}`
}

type ErrorReadableResponse = {
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}

/** Turns a non-2xx Hono RPC response into a readable CLI error. */
export async function assertOk(response: ErrorReadableResponse) {
  if (response.ok) {
    return
  }

  // Anything but JSON here came from the proxy or an error page, not the API.
  const detail = response.headers.get('content-type')?.includes('json')
    ? summarize(await response.text())
    : ''

  throw new ApiHttpError(
    response.status,
    `Request failed with ${response.status}${detail}`,
  )
}

/** Reads a successful Hono RPC response as JSON. */
export async function readJson<T>(
  response: ErrorReadableResponse & { json(): Promise<T> },
): Promise<T> {
  await assertOk(response)

  return response.json()
}
