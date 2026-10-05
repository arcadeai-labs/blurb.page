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
  ItemTitle,
} from '@/components/ui/item'
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
            {toolkit.iconUrl ? (
              <AvatarImage src={toolkit.iconUrl} alt="" />
            ) : null}
            <AvatarFallback>{toolkit.label.slice(0, 1)}</AvatarFallback>
          </HoverCardTrigger>
          <HoverCardContent>
            <ItemGroup>
              <Item size="xs">
                <ItemContent>
                  <ItemTitle>{toolkit.label}</ItemTitle>
                  <ItemDescription>
                    {toolkit.source === 'arcade'
                      ? 'Arcade toolkit'
                      : 'MCP server'}
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
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  )
}
