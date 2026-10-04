import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
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
import { listApps } from '@/lib/mcp'

export const Route = createFileRoute('/_authed/')({
  component: Apps,
})

function Apps() {
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listApps })

  return (
    <Page>
      {appsQuery.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
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
              Add the MCP URL to your agent and ask it to build one.
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
                <CardDescription
                  className="line-clamp-2 min-h-10"
                  title={app.description}
                >
                  {app.description}
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link to="/apps/$name" params={{ name: app.name }} />}
                >
                  Open
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      ) : null}
    </Page>
  )
}
