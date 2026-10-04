import { useQueryClient } from '@tanstack/react-query'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'
import { listApps } from '@/lib/mcp'
import { SlashCommands } from './slash-menu'
import { UiBlock } from './ui-block'

/**
 * A Notion-like editor for a doc's Markdown. ```ui code blocks render as live
 * components; `onChange` gets the Markdown after every edit.
 */
export function DocEditor({
  body,
  onChange,
}: {
  body: string
  onChange: (body: string) => void
}) {
  const queryClient = useQueryClient()
  const [extensions] = useState(() => [
    StarterKit.configure({ link: { openOnClick: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit,
    Placeholder.configure({ placeholder: 'Write, or type / for blocks' }),
    Markdown,
    UiBlock,
    SlashCommands.configure({
      // Shares the apps list's cache, so typing doesn't refetch every key.
      apps: async () => {
        const { apps } = await queryClient.fetchQuery({
          queryKey: ['apps'],
          queryFn: listApps,
          staleTime: 30_000,
        })
        return apps
      },
    }),
  ])
  const editor = useEditor({
    extensions,
    content: body,
    contentType: 'markdown',
    // The page renders on the server too; the editor only exists in the browser.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'doc-editor prose max-w-none dark:prose-invert',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  })

  return <EditorContent editor={editor} />
}
