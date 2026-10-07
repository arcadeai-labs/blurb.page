import { mcp, requireMcpAuth } from '@better-auth/mcp'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { genericOAuth, jwt } from 'better-auth/plugins'
import { and, eq } from 'drizzle-orm'

import { getDb } from '../db'
import * as schema from '../db/schema'
import { defaultGatewayUrl, userGateway } from '../gateways'
import type { McpConnection } from '../mcp'
import { span } from '../trace'
import {
  type ArcadeProvider,
  arcadeClientId,
  arcadeMetadata,
  arcadeScopes,
  arcadeUrls,
  arcadeUser,
  identityClient,
  publicOrigin,
  redirectUri,
} from './arcade'

/** Where Better Auth is mounted, under the API. */
export const authBasePath = '/api/auth'

/** The page that signs users in, and resumes MCP clients' authorization. */
export const loginPath = '/login'

/** The page where users let an MCP client act as them. */
export const consentPath = '/consent'

/**
 * MCP clients (Claude Code, Cursor…) register `http://localhost` or custom
 * scheme redirect URIs without saying they're native apps, and registration
 * defaults to `web`, which only allows https; so those are registered as
 * native.
 */
const nativeClientRegistration = createAuthMiddleware(async (ctx) => {
  const uris: unknown = ctx.body?.redirect_uris

  if (
    ctx.path !== '/oauth2/register' ||
    ctx.body?.application_type ||
    !Array.isArray(uris) ||
    uris.every((uri) => typeof uri === 'string' && uri.startsWith('https:'))
  ) {
    return
  }

  return {
    context: { body: { ...ctx.body, application_type: 'native' } },
  }
})

/**
 * Better Auth for one origin. Users sign in with Arcade only, and the server
 * is also the OAuth authorization server for its own MCP endpoint, so agents
 * connect to `/mcp` as the user who authorized them.
 */
async function createAuth(origin: string) {
  const [clientId, metadata] = await Promise.all([
    arcadeClientId(origin),
    arcadeMetadata(),
  ])
  const identity = identityClient()

  return betterAuth({
    baseURL: origin,
    basePath: authBasePath,
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    // The JWT plugin's own `/token` would clash with the OAuth token endpoint.
    disabledPaths: ['/token'],
    account: {
      encryptOAuthTokens: true,
      // Both providers are the same Arcade account, so they link to one user.
      accountLinking: {
        enabled: true,
        trustedProviders: ['arcade', 'arcade-identity'],
      },
    },
    hooks: { before: nativeClientRegistration },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: 'arcade',
            name: 'Arcade',
            clientId,
            tokenEndpointAuth: { method: 'none' },
            authorizationUrl: metadata.authorization_endpoint,
            tokenUrl: metadata.token_endpoint,
            scopes: arcadeScopes,
            redirectURI: redirectUri(origin, 'arcade'),
            getUserInfo: async (tokens) =>
              tokens.accessToken ? arcadeUser(tokens.accessToken) : null,
            overrideUserInfo: true,
          },
          ...(identity
            ? [
                {
                  providerId: 'arcade-identity',
                  name: 'Arcade account',
                  ...identity,
                  tokenEndpointAuth: { method: 'client_secret_post' as const },
                  discoveryUrl: `${arcadeUrls.identity}/.well-known/openid-configuration`,
                  scopes: ['openid', 'email', 'profile', 'offline_access'],
                  redirectURI: redirectUri(origin, 'arcade-identity'),
                  // Only linked to users who signed in with `arcade`.
                  disableSignUp: true,
                },
              ]
            : []),
        ],
      }),
      jwt(),
      mcp({
        resource: `${origin}/mcp`,
        loginPage: loginPath,
        consentPage: consentPath,
        // MCP clients register themselves.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
    ],
  })
}

export type Auth = Awaited<ReturnType<typeof createAuth>>

/** At most this many origins keep an instance; the oldest is dropped first. */
const maxInstances = 20

const instances = new Map<string, Promise<Auth>>()

/**
 * Better Auth for the origin `request` came in on. The Arcade client ID, the
 * redirect URI and the MCP resource all depend on the origin, and one server
 * answers on several (a loopback address and portless in dev, the deployment
 * and branch URLs of a preview), so each gets its own instance.
 */
export function getAuth(request: Request) {
  const origin = publicOrigin(request)
  let auth = instances.get(origin)

  if (!auth) {
    auth = createAuth(origin)
    auth.catch(() => instances.delete(origin))
    instances.set(origin, auth)

    for (const key of instances.keys()) {
      if (instances.size <= maxInstances) {
        break
      }
      instances.delete(key)
    }
  }

  return auth
}

/** The signed-in user, or `null`. */
export async function getUser(auth: Auth, headers: Headers) {
  const session = await auth.api.getSession({ headers })

  return session?.user ?? null
}

/** The user's Arcade session expired or was revoked; they sign in again. */
export class SignInRequiredError extends Error {
  name = 'SignInRequiredError'
}

/** The user hasn't linked their Arcade account (`arcade-identity`) yet. */
export class AccountNotConnectedError extends Error {
  name = 'AccountNotConnectedError'
}

/** The user's account with `provider`, if they have one. */
export async function findAccount(userId: string, provider: ArcadeProvider) {
  const [account] = await getDb()
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.userId, userId),
        eq(schema.account.providerId, provider),
      ),
    )

  return account ?? null
}

/**
 * The user's access token from `provider`, refreshed when it has expired. A
 * missing or unrenewable `arcade` token means signing in again; a missing
 * `arcade-identity` one, connecting the account.
 */
export async function arcadeAccessToken(
  auth: Auth,
  userId: string,
  provider: ArcadeProvider = 'arcade',
) {
  const missing =
    provider === 'arcade'
      ? new SignInRequiredError('Sign in with Arcade first.')
      : new AccountNotConnectedError(
          'Connect your Arcade account to list your gateways.',
        )
  const account = await findAccount(userId, provider)

  if (!account) {
    throw missing
  }

  try {
    const { accessToken } = await auth.api.getAccessToken({
      body: { accountId: account.id, userId },
    })

    if (accessToken) {
      return accessToken
    }
  } catch (error) {
    throw provider === 'arcade'
      ? new SignInRequiredError(
          'Your Arcade session has expired. Sign in again.',
          { cause: error },
        )
      : new AccountNotConnectedError(
          'Your Arcade account session has expired. Connect it again.',
          { cause: error },
        )
  }

  throw missing
}

/** The user's MCP gateway and their Arcade token, for their tool calls. */
export async function mcpConnection(
  auth: Auth,
  userId: string,
): Promise<McpConnection> {
  const [gateway, accessToken] = await Promise.all([
    span('db.userGateway', () => userGateway(userId)),
    span('auth.accessToken', () => arcadeAccessToken(auth, userId)),
  ])

  return { url: gateway?.url ?? defaultGatewayUrl(), accessToken }
}

/**
 * Runs `handler` as the user an MCP request comes from: the signed-in user of
 * a browser session (the frontend), or the user who authorized the MCP
 * client's access token. Anything else gets the 401 challenge that starts an
 * MCP client's authorization.
 */
export async function withMcpUser(
  request: Request,
  handler: (auth: Auth, userId: string) => Promise<Response>,
) {
  const auth = await span('auth.instance', () => getAuth(request))
  const user = request.headers.has('Authorization')
    ? null
    : await span('auth.session', () => getUser(auth, request.headers))

  if (user) {
    return handler(auth, user.id)
  }

  return requireMcpAuth(
    auth,
    (_, claims) => {
      if (!claims.sub) {
        throw new Error('The access token has no subject')
      }
      return handler(auth, claims.sub)
    },
    { resource: `${publicOrigin(request)}/mcp` },
  )(request)
}
