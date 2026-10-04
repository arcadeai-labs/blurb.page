import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AppRenderer } from '@/components/app-renderer/app-renderer'
import { Page } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { getApp } from '@/lib/mcp'

export const Route = createFileRoute('/_authed/apps/$name')({
  component: AppPage,
})

function AppPage() {
  const { name } = Route.useParams()
  const appQuery = useQuery({
    queryKey: ['apps', name],
    queryFn: () => getApp(name),
  })

  if (appQuery.isPending) {
    return (
      <Page>
        <Skeleton className="h-64" />
      </Page>
    )
  }

  if (appQuery.isError) {
    return (
      <Page title={name}>
        <Alert variant="destructive">
          <AlertTitle>Could not load the app</AlertTitle>
          <AlertDescription>{appQuery.error.message}</AlertDescription>
        </Alert>
      </Page>
    )
  }

  const app = appQuery.data

  return (
    <Page title={app.title} description={app.description}>
      {/* A changed app (e.g. updated by an agent) remounts with fresh state. */}
      <AppRenderer
        key={`${app.id}:${app.updatedAt}`}
        spec={app.spec}
        onLoad={app.onLoad}
      />
    </Page>
  )
}
