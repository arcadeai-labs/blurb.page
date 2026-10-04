import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AppRenderer } from '@/components/app-renderer/app-renderer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { getApp } from '@/lib/mcp'

export const Route = createFileRoute('/apps/$name')({
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
      <main className="grid gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64" />
      </main>
    )
  }

  if (appQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load the app</AlertTitle>
        <AlertDescription>{appQuery.error.message}</AlertDescription>
      </Alert>
    )
  }

  const app = appQuery.data

  return (
    <main className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{app.title}</h1>
        {app.description ? (
          <p className="text-muted-foreground">{app.description}</p>
        ) : null}
      </section>
      {/* A changed app (e.g. updated by an agent) remounts with fresh state. */}
      <AppRenderer key={`${app.id}:${app.updatedAt}`} app={app} />
    </main>
  )
}
