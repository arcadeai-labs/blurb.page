import { cn } from 'cn'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PropsOf } from './components'

// Sizes are in em so text follows its container, e.g. larger on a Slide.
// react-markdown passes each element its syntax tree `node`, which isn't a
// DOM attribute, so every override drops it.
const components: Components = {
  h1: ({ node: _, ...props }) => (
    <h1
      className="text-[2em] leading-tight font-semibold tracking-tight"
      {...props}
    />
  ),
  h2: ({ node: _, ...props }) => (
    <h2
      className="text-[1.5em] leading-tight font-semibold tracking-tight"
      {...props}
    />
  ),
  h3: ({ node: _, ...props }) => (
    <h3 className="text-[1.25em] leading-snug font-semibold" {...props} />
  ),
  h4: ({ node: _, ...props }) => <h4 className="font-semibold" {...props} />,
  ul: ({ node: _, className, ...props }) => (
    <ul
      className={cn(
        'space-y-[0.25em]',
        // GFM task lists show checkboxes instead of bullets.
        className?.includes('contains-task-list')
          ? 'list-none'
          : 'ml-[1.5em] list-disc',
      )}
      {...props}
    />
  ),
  ol: ({ node: _, ...props }) => (
    <ol className="ml-[1.5em] list-decimal space-y-[0.25em]" {...props} />
  ),
  input: ({ node: _, ...props }) => (
    <input className="mr-[0.5em] align-middle" {...props} />
  ),
  blockquote: ({ node: _, ...props }) => (
    <blockquote
      className="border-l-2 border-line pl-[1em] text-muted-foreground italic"
      {...props}
    />
  ),
  a: ({ node: _, ...props }) => (
    <a
      className="font-medium text-primary underline underline-offset-4"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  code: ({ node: _, ...props }) => (
    <code
      className="rounded bg-muted px-[0.3em] py-[0.2em] font-mono text-[0.875em]"
      {...props}
    />
  ),
  pre: ({ node: _, ...props }) => (
    <pre
      className="overflow-x-auto rounded-lg bg-muted p-[1em] font-mono text-[0.875em] [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]"
      {...props}
    />
  ),
  hr: () => <Separator />,
  img: ({ node: _, alt, ...props }) => (
    <img className="max-w-full rounded-lg" alt={alt ?? ''} {...props} />
  ),
  table: ({ node: _, ...props }) => <Table {...props} />,
  thead: ({ node: _, ...props }) => <TableHeader {...props} />,
  tbody: ({ node: _, ...props }) => <TableBody {...props} />,
  tr: ({ node: _, ...props }) => <TableRow {...props} />,
  th: ({ node: _, ...props }) => <TableHead {...props} />,
  td: ({ node: _, ...props }) => <TableCell {...props} />,
}

/** GitHub-flavored Markdown. Raw HTML in it is shown as text, not rendered. */
export function Markdown({ props }: PropsOf<'Markdown'>) {
  return (
    <div className="space-y-[0.75em] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {props.text}
      </ReactMarkdown>
    </div>
  )
}
