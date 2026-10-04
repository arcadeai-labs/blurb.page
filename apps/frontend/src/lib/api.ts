import type { AppType } from '@template/api'
import { queryOptions } from '@tanstack/react-query'
import { hc } from 'hono/client'

// The Hono API (`packages/api`), served by this server at `/api`.
export const api = hc<AppType>('/api')

/** The API answered 401: nobody is signed in. */
export class SignedOutError extends Error {
  name = 'SignedOutError'
}

/** The signed-in user. Fails with {@link SignedOutError} when signed out. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async () => {
    const response = await api.me.$get()

    if (response.status === 401) {
      throw new SignedOutError('Sign in with Arcade first')
    }
    if (!response.ok) {
      throw new Error('Could not load the signed-in user')
    }

    return response.json()
  },
  retry: (count, error) => !(error instanceof SignedOutError) && count < 3,
})
