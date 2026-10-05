import type { InferResponseType } from 'hono/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import type { api } from '@/lib/api'

export type AppToolkit = InferResponseType<
  typeof api.apps.toolkits.$get,
  200
>[number]['toolkits'][number]

/** Whether any of the toolkits' tools is missing from the user's gateway. */
export function missingTools(toolkits: AppToolkit[]) {
  return toolkits.some((toolkit) =>
    toolkit.tools.some((tool) => tool.available === false),
  )
}

function ToolkitIcon({ toolkit }: Readonly<{ toolkit: AppToolkit }>) {
  return (
    <>
      {toolkit.iconUrl ? <AvatarImage src={toolkit.iconUrl} alt="" /> : null}
      <AvatarFallback>{toolkit.label.slice(0, 1)}</AvatarFallback>
    </>
  )
}

/** A toolkit or MCP server and the tools called from it. */
export function ToolkitTools({ toolkit }: Readonly<{ toolkit: AppToolkit }>) {
  return (
    <ItemGroup>
      <Item size="xs">
        <ItemMedia>
          <Avatar size="sm">
            <ToolkitIcon toolkit={toolkit} />
          </Avatar>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{toolkit.label}</ItemTitle>
          <ItemDescription>
            {toolkit.source === 'arcade' ? 'Arcade toolkit' : 'MCP server'}
          </ItemDescription>
        </ItemContent>
      </Item>
      {toolkit.tools.map((tool) => (
        <Item key={tool.functionName} size="xs" variant="outline">
          <ItemContent>
            <ItemTitle>{tool.name}</ItemTitle>
          </ItemContent>
          {tool.available === false ? (
            <ItemActions>
              <Badge variant="destructive">Not on gateway</Badge>
            </ItemActions>
          ) : null}
        </Item>
      ))}
    </ItemGroup>
  )
}

/**
 * The icons of the toolkits and MCP servers an app calls tools from, each
 * listing those tools on hover.
 */
export function AppToolkits({
  toolkits,
}: Readonly<{ toolkits: AppToolkit[] }>) {
  return (
    <div className="flex gap-1">
      {toolkits.map((toolkit) => (
        <HoverCard key={toolkit.name}>
          <HoverCardTrigger
            render={<Avatar size="sm" />}
            tabIndex={0}
            aria-label={toolkit.label}
          >
            <ToolkitIcon toolkit={toolkit} />
          </HoverCardTrigger>
          <HoverCardContent>
            <ToolkitTools toolkit={toolkit} />
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  )
}

/** {@link AppToolkits} once every app's (or script's) toolkits have loaded. */
export function LoadedToolkits({
  query,
  toolkits,
}: Readonly<{
  query: { isPending: boolean; error: Error | null }
  toolkits: AppToolkit[]
}>) {
  if (query.isPending) {
    return <Skeleton className="size-6" />
  }

  if (query.error) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title={query.error.message}
      >
        Could not load tools
      </span>
    )
  }

  return <AppToolkits toolkits={toolkits} />
}
