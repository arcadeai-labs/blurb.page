import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Page } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { listApps, mcpPath } from '@/lib/mcp'

export const Route = createFileRoute('/')({
  component: Apps,
})

/** The MCP URL agents connect to; only known in the browser. */
function useMcpUrl() {
  const [url, setUrl] = useState(mcpPath)

  useEffect(() => {
    setUrl(new URL(mcpPath, window.location.href).toString())
  }, [])

  return url
}

function Apps() {
  const mcpUrl = useMcpUrl()
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listApps })

  return (
    <Page
      title="Apps"
      description={
        <>
          Connect an agent to <code>{mcpUrl}</code> to create and change apps.
        </>
      }
    >
      {appsQuery.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : null}

      {appsQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load apps</AlertTitle>
          <AlertDescription>{appsQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {appsQuery.data?.apps.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No apps yet</EmptyTitle>
            <EmptyDescription>
              Point an agent at {mcpUrl} and ask it to build one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {appsQuery.data?.apps.length ? (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {appsQuery.data.apps.map((app) => (
            <Card key={app.id}>
              <CardHeader>
                <CardTitle>{app.title}</CardTitle>
                <CardDescription>{app.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button variant="outline" asChild>
                  <Link to="/apps/$name" params={{ name: app.name }}>
                    Open
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      ) : null}
    </Page>
  )
}
