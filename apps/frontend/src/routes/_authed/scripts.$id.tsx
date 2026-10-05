import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ToolkitIcon } from '@/components/app-toolkits'
import { Page } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { scriptQuery, scriptToolkitsQuery } from '@/lib/api'

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

/**
 * The toolkits and MCP servers on the user's gateway the script calls tools
 * from, with those tools.
 */
function ScriptToolkits({ id }: Readonly<{ id: string }>) {
  const toolkits = useQuery(scriptToolkitsQuery)

  if (toolkits.isPending) {
    return <Skeleton className="h-6" />
  }

  if (toolkits.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load the script's tools</AlertTitle>
        <AlertDescription>{toolkits.error.message}</AlertDescription>
      </Alert>
    )
  }

  const used = toolkits.data.find((script) => script.id === id)?.toolkits ?? []

  if (used.length === 0) {
    return <p className="text-sm text-muted-foreground">Calls no tools</p>
  }

  return (
    <div className="grid gap-3">
      {used.map((toolkit) => (
        <div key={toolkit.name} className="flex flex-wrap items-center gap-2">
          <Avatar size="sm">
            <ToolkitIcon toolkit={toolkit} />
          </Avatar>
          <span
            className="text-sm font-medium"
            title={
              toolkit.source === 'arcade' ? 'Arcade toolkit' : 'MCP server'
            }
          >
            {toolkit.label}
          </span>
          {toolkit.tools.map((tool) =>
            tool.available === false ? (
              <Badge key={tool.functionName} variant="destructive">
                {tool.name} · Not on gateway
              </Badge>
            ) : (
              <Badge key={tool.functionName} variant="secondary">
                {tool.name}
              </Badge>
            ),
          )}
        </div>
      ))}
    </div>
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
      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Tools</h2>
        <ScriptToolkits id={id} />
      </section>
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
