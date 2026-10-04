import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { McpConnection } from '../mcp'
import {
  type ArcadeProvider,
  callbackPaths,
  clientMetadata,
  clientMetadataPath,
  loopbackCallbackPaths,
  publicOrigin,
} from './arcade'
import {
  arcadeAccessToken,
  authBasePath,
  getAuth,
  getUser,
  mcpConnection,
} from '.'

export type AuthEnv = {
  Variables: {
    user: NonNullable<Awaited<ReturnType<typeof getUser>>>
    /** The user's MCP gateway and Arcade token, for their tool calls. */
    mcpConnection: () => Promise<McpConnection>
    /** The user's identity-provider token, for Arcade's APIs. */
    identityToken: () => Promise<string>
  }
}

/** Rejects requests without a signed-in user, and exposes the user to routes. */
export const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
  const auth = await getAuth(c.req.raw)
  const user = await getUser(auth, c.req.raw.headers)

  if (!user) {
    return c.json({ error: 'Sign in with Arcade first' }, 401)
  }

  c.set('user', user)
  c.set('mcpConnection', () => mcpConnection(auth, user.id))
  c.set('identityToken', () =>
    arcadeAccessToken(auth, user.id, 'arcade-identity'),
  )
  await next()
})

/** Strips the API's mount path, since these routes are mounted under it. */
const underApi = (path: string) => path.replace(/^\/api/, '')

/**
 * Better Auth's endpoints and the Arcade client's metadata, served by the
 * API. Mounted at `/api` before {@link requireUser}, so they stay public.
 */
export const authRoutes = new Hono()
  .on(['GET', 'POST'], `${underApi(authBasePath)}/*`, async (c) =>
    (await getAuth(c.req.raw)).handler(c.req.raw),
  )
  .get(underApi(clientMetadataPath), (c) =>
    c.json(clientMetadata(publicOrigin(c.req.raw))),
  )
  .get(underApi(loopbackCallbackPaths.arcade), (c) =>
    finishOnPortless(c.req.url, 'arcade'),
  )
  .get(underApi(loopbackCallbackPaths['arcade-identity']), (c) =>
    finishOnPortless(c.req.url, 'arcade-identity'),
  )

/**
 * Arcade redirects a portless dev origin's sign-in to the loopback address;
 * the flow's cookies live on the portless origin, so it finishes there.
 */
function finishOnPortless(url: string, provider: ArcadeProvider) {
  const target = process.env.FRONTEND_URL

  if (!target || !new URL(target).hostname.endsWith('.localhost')) {
    return new Response('Only the portless dev server signs in through here', {
      status: 400,
    })
  }

  return Response.redirect(
    `${target}${callbackPaths[provider]}${new URL(url).search}`,
    302,
  )
}

/**
 * OAuth discovery for MCP clients (RFC 8414 and RFC 9728), which look for it
 * at the root of the origin rather than under Better Auth's path.
 */
export const wellKnownRoutes = new Hono().get('/.well-known/*', async (c) =>
  (await getAuth(c.req.raw)).handler(c.req.raw),
)
