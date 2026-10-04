import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Page } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { meQuery, SignedOutError } from '@/lib/api'

// Pages under this layout need a signed-in user; others are sent to /login.
export const Route = createFileRoute('/_authed')({
  component: Authed,
})

function Authed() {
  const me = useQuery(meQuery)
  const navigate = useNavigate()
  const signedOut = me.error instanceof SignedOutError

  // Reads the location once, when the user turns out to be signed out: the
  // location changes while the redirect is pending.
  useEffect(() => {
    if (signedOut) {
      const here = `${window.location.pathname}${window.location.search}`
      navigate({
        href: `/login?next=${encodeURIComponent(here)}`,
        replace: true,
      })
    }
  }, [signedOut, navigate])

  if (me.isPending || signedOut) {
    return (
      <Page>
        <Skeleton className="h-64" />
      </Page>
    )
  }

  if (me.isError) {
    return (
      <Page title="every-ui">
        <Alert variant="destructive">
          <AlertTitle>Could not check who is signed in</AlertTitle>
          <AlertDescription>{me.error.message}</AlertDescription>
        </Alert>
      </Page>
    )
  }

  return <Outlet />
}
