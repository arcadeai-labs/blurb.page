import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Page } from '@/components/page'
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { listApps, mcpPath } from '@/lib/mcp'

export const Route = createFileRoute('/_authed/')({
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

// What to ask an agent once it's connected, cycled through on the home page.
const ideas = [
  'generate a slide deck pitching arcade.dev',
  'generate a component viewing your Linear tickets in a project you pick',
  'build a dashboard of your open GitHub pull requests',
  'chart how your week of Google Calendar meetings adds up',
  'write a doc summarizing your unread Slack threads',
  'make a form that drafts replies to your latest Gmail emails',
]

/** Fades from one idea to the next every few seconds. */
function CyclingIdea() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let fadeIn: ReturnType<typeof setTimeout> | undefined
    const interval = setInterval(() => {
      setVisible(false)
      fadeIn = setTimeout(() => {
        setIndex((i) => (i + 1) % ideas.length)
        setVisible(true)
      }, 500)
    }, 3500)

    return () => {
      clearInterval(interval)
      clearTimeout(fadeIn)
    }
  }, [])

  return (
    <span
      aria-live="polite"
      className={cn(
        'font-medium text-foreground transition-opacity duration-500 motion-reduce:transition-none',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {ideas[index]}
    </span>
  )
}

/** The MCP URL, which copies to the clipboard when clicked. */
function CopyMcpUrl({ url }: Readonly<{ url: string }>) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timeout = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeout)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch (error) {
      toast.add({
        title: 'Could not copy the MCP URL',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      })
    }
  }

  return (
    <InputGroup>
      <InputGroupInput
        readOnly
        value={url}
        aria-label="MCP URL"
        className="cursor-pointer font-mono"
        onClick={copy}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={copied ? 'Copied' : 'Copy MCP URL'}
          onClick={copy}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

function Apps() {
  const mcpUrl = useMcpUrl()
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listApps })

  return (
    <Page title="Apps">
      <Card>
        <CardHeader>
          <CardTitle>Connect your agent</CardTitle>
          <CardDescription>
            Copy this MCP URL into your agent (Claude, Cursor, or any MCP
            client).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <CopyMcpUrl url={mcpUrl} />
          <p className="text-muted-foreground">
            Then ask it to <CyclingIdea />
          </p>
        </CardContent>
      </Card>

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
              Connect an agent and ask it to build one.
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
