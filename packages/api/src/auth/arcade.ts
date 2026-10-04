// Sign-in with Arcade. Every Arcade account can authorize clients on Arcade's
// OAuth server (the one MCP clients use for Arcade's gateways), so every-ui is
// one of its clients: the access token it gets back both identifies the user
// and authenticates their tool calls on the MCP gateway at `MCP_URL`.
import { eq } from 'drizzle-orm'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'

import { getDb } from '../db'
import { arcadeClients } from '../db/schema'

/** Arcade's OAuth server. Override it to sign in against another Arcade stack. */
const issuer =
  process.env.ARCADE_OAUTH_ISSUER ?? 'https://cloud.arcade.dev/oauth2'

/** `mcp` lets the token call MCP gateways; `offline_access` adds a refresh token. */
export const arcadeScopes = ['mcp', 'offline_access']

/** Where Better Auth receives Arcade's redirect (its social sign-in callback). */
export const callbackPath = '/api/auth/callback/arcade'

/** Serves the client metadata document an origin's client ID points at. */
export const clientMetadataPath = '/api/arcade/client.json'

/** Forwards a loopback redirect to the dev server's portless origin. */
export const loopbackCallbackPath = '/api/arcade/callback'

const metadataSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  registration_endpoint: z.url(),
  jwks_uri: z.url(),
})

let metadata: Promise<z.infer<typeof metadataSchema>> | undefined

/** The server's RFC 8414 metadata, fetched once per process. */
export function arcadeMetadata() {
  metadata ??= (async () => {
    const url = new URL(issuer)
    url.pathname = `/.well-known/oauth-authorization-server${url.pathname}`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(
        `Could not load Arcade's OAuth metadata (${response.status})`,
      )
    }

    return metadataSchema.parse(await response.json())
  })().catch((error: unknown) => {
    metadata = undefined
    throw error
  })

  return metadata
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

const claimsSchema = z.object({ sub: z.string(), email: z.email() })

/**
 * Arcade has no userinfo endpoint or ID token; its access tokens are signed
 * JWTs that carry the account's `sub` and `email`.
 */
export async function arcadeUser(accessToken: string) {
  const { issuer, jwks_uri } = await arcadeMetadata()
  jwks ??= createRemoteJWKSet(new URL(jwks_uri))

  const { payload } = await jwtVerify(accessToken, jwks, {
    issuer,
    typ: 'at+jwt',
  })
  const claims = claimsSchema.parse(payload)

  return {
    id: claims.sub,
    email: claims.email,
    name: claims.email,
    emailVerified: true,
  }
}

function isLoopback(hostname: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

/** Dev hosts: loopback, and the `*.localhost` names portless serves. */
function isLocal(hostname: string) {
  return isLoopback(hostname) || hostname.endsWith('.localhost')
}

/**
 * The origin users and MCP clients reach this server at. Requests on a
 * loopback address keep their own origin (MCP clients in dev use it);
 * everything else uses `FRONTEND_URL` when it's set, like app URLs do.
 */
export function publicOrigin(request: Request) {
  const url = new URL(request.url)

  if (isLoopback(url.hostname)) {
    return url.origin
  }

  return (process.env.FRONTEND_URL ?? url.origin).replace(/\/$/, '')
}

/**
 * Arcade only redirects over http to bare loopback hosts, so a portless
 * `https://*.localhost` origin is sent back through this server's loopback
 * address, which forwards to it (see {@link loopbackCallbackPath}).
 */
export function redirectUri(origin: string) {
  const { hostname } = new URL(origin)

  if (isLocal(hostname) && !isLoopback(hostname)) {
    return `http://127.0.0.1:${process.env.PORT ?? 5173}${loopbackCallbackPath}`
  }

  return `${origin}${callbackPath}`
}

/** The client metadata document an origin's client ID points at. */
export function clientMetadata(origin: string) {
  return {
    client_id: `${origin}${clientMetadataPath}`,
    client_name: 'every-ui',
    client_uri: origin,
    redirect_uris: [redirectUri(origin)],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: arcadeScopes.join(' '),
  }
}

/**
 * Arcade expires unused registrations after 30 days, so local clients are
 * registered again before that.
 */
const registrationMaxAgeMs = 25 * 24 * 60 * 60 * 1000

const registrationSchema = z.object({ client_id: z.string() })

/** Registers a client for `origin` through dynamic client registration. */
async function registerClient(origin: string) {
  const { registration_endpoint } = await arcadeMetadata()
  const { client_id: _, ...body } = clientMetadata(origin)

  const response = await fetch(registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(
      `Could not register with Arcade (${response.status}): ${await response.text()}`,
    )
  }

  return registrationSchema.parse(await response.json()).client_id
}

/**
 * The client ID every-ui signs in with on `origin`. Public origins use a
 * Client ID Metadata Document: the ID is the URL of {@link clientMetadata},
 * which Arcade fetches, so nothing is registered. Arcade can't reach a dev
 * server, so local origins register a client instead, kept in the database
 * so restarts don't sign everyone out.
 */
export async function arcadeClientId(origin: string) {
  if (!isLocal(new URL(origin).hostname)) {
    return clientMetadata(origin).client_id
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Signing in on ${origin} needs the dev server (pnpm dev): Arcade can't fetch a local origin's client metadata`,
    )
  }

  const db = getDb()
  const [existing] = await db
    .select()
    .from(arcadeClients)
    .where(eq(arcadeClients.origin, origin))

  if (
    existing &&
    Date.now() - existing.updatedAt.getTime() < registrationMaxAgeMs
  ) {
    return existing.clientId
  }

  const clientId = await registerClient(origin)

  await db
    .insert(arcadeClients)
    .values({ origin, clientId })
    .onConflictDoUpdate({
      target: arcadeClients.origin,
      set: { clientId, updatedAt: new Date() },
    })

  return clientId
}
