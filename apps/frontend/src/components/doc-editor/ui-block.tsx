import { type Embed, embedLanguage, parseEmbed } from '@template/api/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { mergeAttributes, Node } from '@tiptap/core'
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from '@tiptap/react'
import { cn } from 'cn'
import { useState } from 'react'
import { AppRenderer } from '@/components/app-renderer/app-renderer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { getApp } from '@/lib/mcp'

/** What the slash menu inserts: a component to replace with something useful. */
export const newEmbedSource = JSON.stringify(
  {
    root: 'text',
    elements: {
      text: {
        type: 'Text',
        props: { text: 'New component' },
        children: [],
      },
    },
  },
  null,
  2,
)

function EmbedErrors({ errors }: { errors: string[] }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Invalid component</AlertTitle>
      <AlertDescription>
        {errors.map((error) => (
          <p key={error}>{error}</p>
        ))}
      </AlertDescription>
    </Alert>
  )
}

function EditEmbedDialog({
  source,
  onClose,
  onSave,
  onRemove,
}: {
  source: string
  onClose: () => void
  onSave: (source: string) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(source)
  const parsed = parseEmbed(draft)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit component</DialogTitle>
        </DialogHeader>
        <Field data-invalid={!parsed.ok}>
          <FieldLabel htmlFor="embed-source">json-render spec</FieldLabel>
          <Textarea
            id="embed-source"
            className="h-96 font-mono"
            value={draft}
            aria-invalid={!parsed.ok}
            onChange={(event) => setDraft(event.target.value)}
          />
          {parsed.ok ? null : (
            <FieldError>{parsed.errors.join('; ')}</FieldError>
          )}
        </Field>
        <DialogFooter>
          <Button variant="destructive" onClick={onRemove}>
            Remove
          </Button>
          <Button
            disabled={!parsed.ok}
            onClick={() => {
              // Saved pretty-printed, so the doc's Markdown stays readable.
              onSave(JSON.stringify(JSON.parse(draft), null, 2))
              onClose()
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A saved app, mounted by name and kept up to date with it. */
function MountedApp({ name }: { name: string }) {
  const appQuery = useQuery({
    queryKey: ['apps', name],
    queryFn: () => getApp(name),
  })

  if (appQuery.isPending) {
    return <Skeleton className="h-32" />
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
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="grid min-w-0 gap-0.5">
          <p className="truncate text-sm font-medium">{app.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {app.description}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/apps/$name" params={{ name: app.name }} />}
        >
          Open
        </Button>
      </div>
      {/* A changed app (e.g. updated by an agent) remounts with fresh state. */}
      <AppRenderer
        key={`${app.id}:${app.updatedAt}`}
        spec={app.spec}
        onLoad={app.onLoad}
      />
    </>
  )
}

function EmbedView({ embed }: { embed: Embed }) {
  return embed.kind === 'app' ? (
    <MountedApp name={embed.app} />
  ) : (
    <AppRenderer spec={embed.spec} />
  )
}

function UiBlockView({
  node,
  editor,
  selected,
  updateAttributes,
  deleteNode,
}: ReactNodeViewProps) {
  const [editing, setEditing] = useState(false)
  const source = String(node.attrs.source ?? '')
  const parsed = parseEmbed(source)
  const height = parsed.ok ? parsed.height : undefined

  return (
    <NodeViewWrapper
      // Blocks are as tall as their content, unless they hold something that
      // fills its parent (a ScrollArea without a height, Slides): then the
      // block gives it room, with a default height or the one it sets. Text
      // inside looks as it does in an app, not like the doc's prose.
      className={cn(
        'not-prose my-4 flex flex-col gap-2 leading-normal text-foreground',
        height === undefined && 'has-[[data-fill]]:h-150',
      )}
      style={height === undefined ? undefined : { height }}
      data-selected={selected || undefined}
    >
      {parsed.ok ? (
        // A changed block remounts with fresh state, like an updated app.
        <EmbedView key={source} embed={parsed} />
      ) : (
        <EmbedErrors errors={parsed.errors} />
      )}
      {editor.isEditable ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit component
          </Button>
          {editing ? (
            <EditEmbedDialog
              source={source}
              onClose={() => setEditing(false)}
              onSave={(next) => updateAttributes({ source: next })}
              onRemove={deleteNode}
            />
          ) : null}
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}

/**
 * A live component in a doc: a json-render spec, kept in Markdown as a
 * fenced ```ui code block. It takes those blocks before the code block node.
 */
export const UiBlock = Node.create({
  name: 'uiBlock',
  group: 'block',
  atom: true,
  draggable: true,
  priority: 200,

  addAttributes() {
    return {
      source: {
        default: newEmbedSource,
        parseHTML: (element) => element.getAttribute('data-source'),
        renderHTML: (attributes) => ({ 'data-source': attributes.source }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-ui-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-ui-block': '' }, HTMLAttributes)]
  },

  markdownTokenName: 'code',

  parseMarkdown: (token, helpers) =>
    token.lang === embedLanguage && token.codeBlockStyle !== 'indented'
      ? helpers.createNode('uiBlock', { source: token.text })
      : [],

  renderMarkdown: (node) =>
    [`\`\`\`${embedLanguage}`, String(node.attrs?.source ?? ''), '```'].join(
      '\n',
    ),

  addNodeView() {
    return ReactNodeViewRenderer(UiBlockView)
  },
})
