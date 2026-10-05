import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { scriptQuery } from '@/lib/api'

export const Route = createFileRoute('/_authed/scripts/$id')({
  component: ScriptPage,
})

function Code({ children }: Readonly<{ children: string }>) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm">
      <code>{children}</code>
    </pre>
  )
}

function ScriptPage() {
  const { id } = Route.useParams()
  const script = useQuery(scriptQuery(id))

  if (script.isPending) {
    return (
      <Page>
        <Skeleton className="h-64" />
      </Page>
    )
  }

  if (script.isError) {
    return (
      <Page title="Script">
        <Alert variant="destructive">
          <AlertTitle>Could not load the script</AlertTitle>
          <AlertDescription>{script.error.message}</AlertDescription>
        </Alert>
      </Page>
    )
  }

  const { name, description, source, inputSchema, outputSchema } = script.data

  return (
    <Page title={name} description={description}>
      <Tabs defaultValue="source">
        <TabsList>
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="input">Input schema</TabsTrigger>
          <TabsTrigger value="output">Output schema</TabsTrigger>
        </TabsList>
        <TabsContent value="source">
          <Code>{source}</Code>
        </TabsContent>
        <TabsContent value="input">
          <Code>{JSON.stringify(inputSchema, null, 2)}</Code>
        </TabsContent>
        <TabsContent value="output">
          <Code>{JSON.stringify(outputSchema, null, 2)}</Code>
        </TabsContent>
      </Tabs>
    </Page>
  )
}
