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
import { meQuery, SignedOutError } from '@/lib/api'
import { connectArcadeAccount } from '@/lib/auth-client'

// Right after sign-in, links the user's Arcade account (the dashboard's
// sign-in, which lists their gateways) and moves on to `next`. It's the same
// Arcade login, so this usually passes straight through.
export const Route = createFileRoute('/connect')({
  head: () => ({ meta: [{ title: 'Connecting · blurb.page' }] }),
  component: Connect,
})

/** `next` from the query: a same-origin page, or the apps list. */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next')

  return next?.startsWith('/') && !next.startsWith('//') ? next : '/'
}

function Connect() {
  const me = useQuery(meQuery)
  const navigate = useNavigate()
  const connect = useMutation({
    mutationFn: () =>
      connectArcadeAccount(
        nextPath(),
        `${window.location.pathname}${window.location.search}`,
      ),
  })

  const account = me.data?.account
  const signedOut = me.error instanceof SignedOutError
  const startConnect = connect.mutate
  const connectIdle = connect.isIdle

  useEffect(() => {
    if (signedOut) {
      navigate({ to: '/login', replace: true })
      return
    }
    if (!account) {
      return
    }
    if (!account.available || account.connected) {
      navigate({ href: nextPath(), replace: true })
      return
    }
    // After a failed attempt, Better Auth comes back here with `error`.
    if (
      connectIdle &&
      !new URLSearchParams(window.location.search).has('error')
    ) {
      startConnect()
    }
  }, [signedOut, account, connectIdle, startConnect, navigate])

  const callbackError =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('error')
  const error = connect.error?.message ?? callbackError ?? me.error?.message

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Connecting your Arcade account</CardTitle>
          <CardDescription>
            It lists your projects and gateways, so you can pick where your
            tools run.
          </CardDescription>
        </CardHeader>
        {error ? (
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>Could not connect your Arcade account</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        ) : null}
        <CardFooter>
          {error ? (
            <>
              <Button
                variant="outline"
                onClick={() => navigate({ href: nextPath(), replace: true })}
              >
                Skip for now
              </Button>
              <Button
                disabled={connect.isPending}
                onClick={() => connect.mutate()}
              >
                Try again
              </Button>
            </>
          ) : (
            <Spinner />
          )}
        </CardFooter>
      </Card>
    </main>
  )
}
