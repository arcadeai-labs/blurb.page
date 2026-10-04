import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { createAuthClient } from 'better-auth/react'

// Better Auth (`packages/api/src/auth`), served by this server at `/api/auth`.
// Users sign in with Arcade. The OAuth provider plugin sends MCP clients'
// authorization to the login and consent pages with a signed query, which
// this client passes back so the authorization resumes after sign-in.
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [oauthProviderClient()],
})

/**
 * Links the user's Arcade account (the dashboard's sign-in), which lists their
 * gateways, then returns to `next`. It's the same Arcade login, so it usually
 * goes straight through.
 */
export async function connectArcadeAccount(next: string, errorPath: string) {
  const { error } = await authClient.linkSocial({
    provider: 'arcade-identity',
    callbackURL: next,
    errorCallbackURL: errorPath,
  })

  if (error) {
    throw new Error(error.message ?? 'Could not connect your Arcade account')
  }
}
