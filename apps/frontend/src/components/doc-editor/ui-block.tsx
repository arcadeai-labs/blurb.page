import { embedLanguage, parseEmbed } from '@template/api/ui'
import { mergeAttributes, Node } from '@tiptap/core'
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from '@tiptap/react'
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
import { Textarea } from '@/components/ui/textarea'

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

  return (
    <NodeViewWrapper
      className="not-prose my-4 grid gap-2"
      data-selected={selected || undefined}
    >
      {parsed.ok ? (
        // A changed spec remounts with fresh state, like an updated app.
        <AppRenderer key={source} spec={parsed.spec} />
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
