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
import { scriptsQuery } from '@/lib/api'

export const Route = createFileRoute('/_authed/scripts/')({
  component: Scripts,
})

function Scripts() {
  const scripts = useQuery(scriptsQuery)

  return (
    <Page
      title="Scripts"
      description="The code apps and docs run on your tools"
    >
      {scripts.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : null}

      {scripts.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load scripts</AlertTitle>
          <AlertDescription>{scripts.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {scripts.data?.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No scripts yet</EmptyTitle>
            <EmptyDescription>
              Agents write scripts when they build apps.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {scripts.data?.length ? (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scripts.data.map((script) => (
            <Card key={script.id}>
              <CardHeader>
                <CardTitle>{script.name}</CardTitle>
                <CardDescription
                  className="line-clamp-2 min-h-10"
                  title={script.description}
                >
                  {script.description}
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link to="/scripts/$id" params={{ id: script.id }} />}
                >
                  View
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      ) : null}
    </Page>
  )
}
