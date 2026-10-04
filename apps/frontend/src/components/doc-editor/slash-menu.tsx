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
import type { AppSummary } from '@template/api/ui'
import { forwardRef, useImperativeHandle, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { newEmbedSource } from './ui-block'

const groups = ['Blocks', 'Apps'] as const

type SlashItem = {
  id: string
  title: string
  group: (typeof groups)[number]
  keywords: string[]
  run: (editor: Editor, range: Range) => void
}

/** Turns the current block into something else, after removing the typed `/…`. */
function block(run: (chain: ChainedCommands) => ChainedCommands) {
  return (editor: Editor, range: Range) =>
    run(editor.chain().focus().deleteRange(range)).run()
}

const blockItems: SlashItem[] = [
  {
    id: 'Text',
    title: 'Text',
    group: 'Blocks',
    keywords: ['paragraph', 'p'],
    run: block((chain) => chain.setParagraph()),
  },
  {
    id: 'Heading 1',
    title: 'Heading 1',
    group: 'Blocks',
    keywords: ['h1', 'title'],
    run: block((chain) => chain.setHeading({ level: 1 })),
  },
  {
    id: 'Heading 2',
    title: 'Heading 2',
    group: 'Blocks',
    keywords: ['h2', 'subtitle'],
    run: block((chain) => chain.setHeading({ level: 2 })),
  },
  {
    id: 'Heading 3',
    title: 'Heading 3',
    group: 'Blocks',
    keywords: ['h3'],
    run: block((chain) => chain.setHeading({ level: 3 })),
  },
  {
    id: 'Bulleted list',
    title: 'Bulleted list',
    group: 'Blocks',
    keywords: ['ul', 'unordered'],
    run: block((chain) => chain.toggleBulletList()),
  },
  {
    id: 'Numbered list',
    title: 'Numbered list',
    group: 'Blocks',
    keywords: ['ol', 'ordered'],
    run: block((chain) => chain.toggleOrderedList()),
  },
  {
    id: 'To-do list',
    title: 'To-do list',
    group: 'Blocks',
    keywords: ['task', 'checkbox', 'todo'],
    run: block((chain) => chain.toggleTaskList()),
  },
  {
    id: 'Quote',
    title: 'Quote',
    group: 'Blocks',
    keywords: ['blockquote'],
    run: block((chain) => chain.toggleBlockquote()),
  },
  {
    id: 'Code',
    title: 'Code',
    group: 'Blocks',
    keywords: ['codeblock', 'pre'],
    run: block((chain) => chain.toggleCodeBlock()),
  },
  {
    id: 'Table',
    title: 'Table',
    group: 'Blocks',
    keywords: ['grid'],
    run: block((chain) =>
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    ),
  },
  {
    id: 'Divider',
    title: 'Divider',
    group: 'Blocks',
    keywords: ['hr', 'separator', 'rule'],
    run: block((chain) => chain.setHorizontalRule()),
  },
  {
    id: 'Component',
    title: 'Component',
    group: 'Blocks',
    keywords: ['ui', 'embed', 'chart', 'table', 'app', 'json'],
    run: block((chain) =>
      chain.insertContent({
        type: 'uiBlock',
        attrs: { source: newEmbedSource },
      }),
    ),
  },
]

/** Mounts a saved app, which stays up to date with it. */
function appItem(app: AppSummary): SlashItem {
  return {
    id: `app:${app.name}`,
    title: app.title,
    group: 'Apps',
    keywords: [app.name, 'app'],
    run: block((chain) =>
      chain.insertContent({
        type: 'uiBlock',
        attrs: { source: JSON.stringify({ app: app.name }, null, 2) },
      }),
    ),
  }
}

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
        value={found[index]?.id ?? ''}
        onValueChange={(id) =>
          setSelected(found.findIndex((item) => item.id === id))
        }
        className="w-56 border shadow-md"
      >
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>
          {groups.map((group) => {
            const inGroup = found.filter((item) => item.group === group)

            return inGroup.length > 0 ? (
              <CommandGroup key={group} heading={group}>
                {inGroup.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => command(item)}
                  >
                    {item.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null
          })}
        </CommandList>
      </Command>
    )
  },
)

/**
 * Type `/` to turn a block into a heading, list, table, component…, or to
 * mount one of the saved apps listed by `apps`.
 */
export const SlashCommands = Extension.create<{
  apps: () => Promise<AppSummary[]>
}>({
  name: 'slashCommands',

  addOptions() {
    return { apps: async () => [] }
  },

  addProseMirrorPlugins() {
    const { apps } = this.options

    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        items: async ({ query }) => {
          // Without the apps (e.g. offline), the blocks still work.
          const saved = await apps().catch(() => [])

          return [...blockItems, ...saved.map(appItem)].filter((item) =>
            matches(item, query),
          )
        },
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
