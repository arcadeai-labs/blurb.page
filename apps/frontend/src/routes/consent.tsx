import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
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
import { Skeleton } from '@/components/ui/skeleton'
import { meQuery } from '@/lib/api'
import { authClient } from '@/lib/auth-client'

// Asks the signed-in user whether an MCP client may act as them. The OAuth
// provider sends users here with a signed query naming the client.
export const Route = createFileRoute('/consent')({
  head: () => ({ meta: [{ title: 'Allow access · every-ui' }] }),
  component: Consent,
})

function Consent() {
  const me = useQuery(meQuery)
  const client = useQuery({
    queryKey: ['oauth-client', 'consent'],
    queryFn: async () => {
      const clientId = new URLSearchParams(window.location.search).get(
        'client_id',
      )

      if (!clientId) {
        throw new Error('This page was opened without a client to authorize')
      }

      const { data, error } = await authClient.oauth2.publicClient({
        query: { client_id: clientId },
      })

      if (error) {
        throw new Error(error.message ?? 'Could not load the client')
      }

      return data
    },
  })

  const consent = useMutation({
    mutationFn: async (accept: boolean) => {
      const { data, error } = await authClient.oauth2.consent({ accept })

      if (error) {
        throw new Error(error.message ?? 'Could not save your answer')
      }

      window.location.href = data.url
    },
  })

  const error = me.error ?? client.error ?? consent.error

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {client.isPending || me.isPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <>
              <CardTitle>
                Allow {client.data?.client_name ?? 'this app'} to use every-ui?
              </CardTitle>
              <CardDescription>
                It will build and run apps as {me.data?.email}, with your Arcade
                connections.
              </CardDescription>
            </>
          )}
        </CardHeader>
        {error ? (
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          </CardContent>
        ) : null}
        <CardFooter>
          <Button
            variant="outline"
            disabled={consent.isPending}
            onClick={() => consent.mutate(false)}
          >
            Deny
          </Button>
          <Button
            disabled={consent.isPending || !client.isSuccess}
            onClick={() => consent.mutate(true)}
          >
            Allow
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
