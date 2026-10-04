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
