import type { AppType } from '@template/api'
import { hc } from 'hono/client'
import { APP_NAME } from './apps.ts'
import { getPortlessRoute } from './portless.ts'
import { trustPortlessCa } from './tls.ts'
import { findRepoRoot } from './workspace.ts'

/**
 * Where the API lives. Explicit `--base-url` wins, then `TEMPLATE_API_BASE_URL`,
 * then the app's portless URL.
 */
export function resolveBaseUrl(explicit?: string): string {
  const configured = explicit ?? process.env.TEMPLATE_API_BASE_URL

  if (configured) {
    return configured.replace(/\/$/, '')
  }

  return getPortlessRoute(APP_NAME, findRepoRoot() ?? process.cwd()).url
}

export function createApiClient(baseUrl: string) {
  trustPortlessCa()

  return hc<AppType>(`${baseUrl}/api`)
}

export type ApiClient = ReturnType<typeof createApiClient>

class ApiHttpError extends Error {
  status: number
  /** Whether the API itself answered, rather than the proxy in front of it. */
  fromApi: boolean

  constructor(status: number, message: string, fromApi: boolean) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
    this.fromApi = fromApi
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
      !error.fromApi &&
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
  const fromApi = !!response.headers.get('content-type')?.includes('json')
  const detail = fromApi ? summarize(await response.text()) : ''

  throw new ApiHttpError(
    response.status,
    `Request failed with ${response.status}${detail}`,
    fromApi,
  )
}

type JsonResponse = ErrorReadableResponse & { json(): Promise<unknown> }

/** The JSON body of the 2xx variants of a Hono RPC response union. */
type SuccessJson<R> = R extends { ok: false }
  ? never
  : R extends { json(): Promise<infer T> }
    ? T
    : never

/** Reads a successful Hono RPC response as JSON. */
export async function readJson<R extends JsonResponse>(
  response: R,
): Promise<SuccessJson<R>>
export async function readJson(response: JsonResponse): Promise<unknown> {
  await assertOk(response)

  return response.json()
}
