import {
  type ChainedCommands,
  type Editor,
  Extension,
  type Range,
} from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion'
import { forwardRef, useImperativeHandle, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { newEmbedSource } from './ui-block'

type SlashItem = {
  title: string
  keywords: string[]
  run: (editor: Editor, range: Range) => void
}

/** Turns the current block into something else, after removing the typed `/…`. */
function block(run: (chain: ChainedCommands) => ChainedCommands) {
  return (editor: Editor, range: Range) =>
    run(editor.chain().focus().deleteRange(range)).run()
}

const items: SlashItem[] = [
  {
    title: 'Text',
    keywords: ['paragraph', 'p'],
    run: block((chain) => chain.setParagraph()),
  },
  {
    title: 'Heading 1',
    keywords: ['h1', 'title'],
    run: block((chain) => chain.setHeading({ level: 1 })),
  },
  {
    title: 'Heading 2',
    keywords: ['h2', 'subtitle'],
    run: block((chain) => chain.setHeading({ level: 2 })),
  },
  {
    title: 'Heading 3',
    keywords: ['h3'],
    run: block((chain) => chain.setHeading({ level: 3 })),
  },
  {
    title: 'Bulleted list',
    keywords: ['ul', 'unordered'],
    run: block((chain) => chain.toggleBulletList()),
  },
  {
    title: 'Numbered list',
    keywords: ['ol', 'ordered'],
    run: block((chain) => chain.toggleOrderedList()),
  },
  {
    title: 'To-do list',
    keywords: ['task', 'checkbox', 'todo'],
    run: block((chain) => chain.toggleTaskList()),
  },
  {
    title: 'Quote',
    keywords: ['blockquote'],
    run: block((chain) => chain.toggleBlockquote()),
  },
  {
    title: 'Code',
    keywords: ['codeblock', 'pre'],
    run: block((chain) => chain.toggleCodeBlock()),
  },
  {
    title: 'Table',
    keywords: ['grid'],
    run: block((chain) =>
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    ),
  },
  {
    title: 'Divider',
    keywords: ['hr', 'separator', 'rule'],
    run: block((chain) => chain.setHorizontalRule()),
  },
  {
    title: 'Component',
    keywords: ['ui', 'embed', 'chart', 'table', 'app', 'json'],
    run: block((chain) =>
      chain.insertContent({
        type: 'uiBlock',
        attrs: { source: newEmbedSource },
      }),
    ),
  },
]

function matches(item: SlashItem, query: string) {
  const search = query.toLowerCase()

  return [item.title, ...item.keywords].some((word) =>
    word.toLowerCase().includes(search),
  )
}

type SlashMenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean }

type SlashMenuProps = SuggestionProps<SlashItem, SlashItem>

const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  function SlashMenu({ items: found, command }, ref) {
    const [selected, setSelected] = useState(0)
    const index = Math.min(selected, found.length - 1)

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowDown') {
          setSelected((index + 1) % found.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setSelected((index - 1 + found.length) % found.length)
          return true
        }
        if (event.key === 'Enter') {
          const item = found[index]
          if (item) command(item)
          return true
        }
        return false
      },
    }))

    return (
      <Command
        shouldFilter={false}
        value={found[index]?.title ?? ''}
        onValueChange={(title) =>
          setSelected(found.findIndex((item) => item.title === title))
        }
        className="w-56 border shadow-md"
      >
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>
          {found.map((item) => (
            <CommandItem
              key={item.title}
              value={item.title}
              onSelect={() => command(item)}
            >
              {item.title}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    )
  },
)

/** Type `/` to turn a block into a heading, list, table, component… */
export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        items: ({ query }) => items.filter((item) => matches(item, query)),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let menu: ReactRenderer<SlashMenuHandle, SlashMenuProps> | undefined
          let unmount: (() => void) | undefined

          return {
            onStart: (props) => {
              menu = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor,
              })
              unmount = props.mount(menu.element)
            },
            onUpdate: (props) => menu?.updateProps(props),
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                return false
              }
              return menu?.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              unmount?.()
              menu?.destroy()
            },
          }
        },
      }),
    ]
  },
})
