import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommands } from './slash-menu'
import { UiBlock } from './ui-block'

const extensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit,
  Placeholder.configure({ placeholder: 'Write, or type / for blocks' }),
  Markdown,
  UiBlock,
  SlashCommands,
]

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
