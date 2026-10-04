import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { meQuery } from '@/lib/api'
import { authClient } from '@/lib/auth-client'

// Signs users in with Arcade. The OAuth provider also sends MCP clients'
// authorization here, with a signed query, when nobody is signed in.
export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: 'Sign in · every-ui' }] }),
  component: Login,
})

/** Where to go after signing in: a same-origin page, or the apps list. */
function nextPath(search: string) {
  const next = new URLSearchParams(search).get('next')

  if (
    next?.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/login')
  ) {
    return next
  }

  return '/'
}

function Login() {
  const me = useQuery(meQuery)
  const navigate = useNavigate()

  // An MCP client's authorization (a signed query in this page's URL) resumes
  // on its own after sign-in; anyone else goes back to where they were.
  const signIn = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.social({
        provider: 'arcade',
        // Links their Arcade account (which lists gateways) on the way.
        callbackURL: `/connect?next=${encodeURIComponent(nextPath(window.location.search))}`,
        errorCallbackURL: `${window.location.pathname}${window.location.search}`,
      })

      if (error) {
        throw new Error(error.message ?? 'Could not sign in')
      }
    },
  })

  // Signed-in users skip this page, unless an MCP client asked them to sign
  // in (again) to authorize it.
  const signedIn = me.isSuccess

  useEffect(() => {
    if (signedIn && !new URLSearchParams(window.location.search).has('sig')) {
      navigate({ href: nextPath(window.location.search), replace: true })
    }
  }, [signedIn, navigate])

  const callbackError =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('error')

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to every-ui</CardTitle>
          <CardDescription>
            Use your Arcade account. Your apps run tools with your own
            connections.
          </CardDescription>
        </CardHeader>
        {signIn.error || callbackError ? (
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>Could not sign in</AlertTitle>
              <AlertDescription>
                {signIn.error?.message ?? callbackError}
              </AlertDescription>
            </Alert>
          </CardContent>
        ) : null}
        <CardFooter>
          <Button
            disabled={me.isPending || signIn.isPending}
            onClick={() => signIn.mutate()}
          >
            {me.isPending || signIn.isPending ? <Spinner /> : null}
            Continue with Arcade
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
