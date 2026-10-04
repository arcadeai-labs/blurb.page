import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'

import {
  callbackPath,
  clientMetadata,
  clientMetadataPath,
  loopbackCallbackPath,
  publicOrigin,
} from './arcade'
import { arcadeAccessToken, authBasePath, getAuth, getUser } from '.'

export type AuthEnv = {
  Variables: {
    user: NonNullable<Awaited<ReturnType<typeof getUser>>>
    /** The user's Arcade access token, for their calls to `MCP_URL`. */
    arcadeToken: () => Promise<string>
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
  c.set('arcadeToken', () => arcadeAccessToken(auth, user.id))
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
  // Arcade redirects a portless dev origin's sign-in here, on the loopback
  // address; the flow's cookies live on the portless origin, so finish there.
  .get(underApi(loopbackCallbackPath), (c) => {
    const target = process.env.FRONTEND_URL

    if (!target || !new URL(target).hostname.endsWith('.localhost')) {
      return c.text('Only the portless dev server signs in through here', 400)
    }

    return c.redirect(`${target}${callbackPath}${new URL(c.req.url).search}`)
  })

/**
 * OAuth discovery for MCP clients (RFC 8414 and RFC 9728), which look for it
 * at the root of the origin rather than under Better Auth's path.
 */
export const wellKnownRoutes = new Hono().get('/.well-known/*', async (c) =>
  (await getAuth(c.req.raw)).handler(c.req.raw),
)
