// Request traces: every request records nested, timed spans (kept per request
// with AsyncLocalStorage, so nothing is passed around), to show where a slow
// request's time went. Each response carries them in a `Server-Timing` header
// (the Timing tab of the browser's network panel), and requests slower than
// `TRACE_SLOW_MS` (default 1000, `0` for all) are logged as a waterfall.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { MiddlewareHandler } from 'hono'

type Attributes = Record<string, string | number | boolean>

type Span = {
  name: string
  attributes: Attributes
  start: number
  end?: number
  error?: string
  children: Span[]
}

const active = new AsyncLocalStorage<Span>()

function startSpan(name: string, attributes: Attributes = {}): Span {
  return { name, attributes, start: performance.now(), children: [] }
}

/**
 * Times `fn` as a span of the current request's trace, nested under the span
 * it runs in. Outside a request it just runs `fn`.
 */
export async function span<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Attributes = {},
): Promise<T> {
  const parent = active.getStore()

  if (!parent) {
    return fn()
  }

  const child = startSpan(name, attributes)
  parent.children.push(child)

  try {
    return await active.run(child, fn)
  } catch (error) {
    child.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    child.end = performance.now()
  }
}

/** Adds attributes to the current span (the request's, outside any span). */
export function annotate(attributes: Attributes) {
  const current = active.getStore()

  if (current) {
    Object.assign(current.attributes, attributes)
  }
}

/** One line of a trace: a span, or several same-named siblings folded into one. */
type Line = {
  depth: number
  label: string
  offset: number
  duration: number
  error?: string
}

function label(name: string, attributes: Attributes) {
  return [
    name,
    ...Object.entries(attributes).map(([key, value]) => `${key}=${value}`),
  ].join(' ')
}

/**
 * The trace as lines, depth first. Same-named siblings (a paginated list's
 * pages, a script's repeated tool calls) fold into one `xN` line spanning
 * from the first's start to the last's end.
 */
function traceLines(root: Span, end: number): Line[] {
  const lines: Line[] = []

  const visit = (spans: Span[], depth: number) => {
    const groups = new Map<string, Span[]>()

    for (const child of spans) {
      groups.set(child.name, [...(groups.get(child.name) ?? []), child])
    }

    for (const [name, group] of groups) {
      const start = Math.min(...group.map((child) => child.start))
      const stop = Math.max(...group.map((child) => child.end ?? end))
      const [first] = group

      lines.push({
        depth,
        label:
          group.length === 1 && first
            ? label(name, first.attributes)
            : `${name} x${group.length}`,
        offset: start - root.start,
        duration: stop - start,
        error: group.find((child) => child.error)?.error,
      })

      if (group.length === 1 && first) {
        visit(first.children, depth + 1)
      }
    }
  }

  visit(root.children, 0)
  return lines
}

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`
}

const barWidth = 40

/** A text waterfall: each line's offset, duration and a bar on one timeline. */
function render(root: Span, total: number, lines: Line[]) {
  const labels = lines.map(
    (line) =>
      `${'  '.repeat(line.depth)}${line.label}${line.error ? ' (failed)' : ''}`,
  )
  const width = Math.max(...labels.map((text) => text.length), 0)
  const scale = total > 0 ? barWidth / total : 0

  return [
    `[trace] ${label(root.name, root.attributes)} ${formatMs(total)}`,
    ...lines.map((line, index) => {
      const lead = Math.min(Math.floor(line.offset * scale), barWidth - 1)
      const bar = Math.max(1, Math.round(line.duration * scale))

      return [
        `  ${(labels[index] ?? '').padEnd(width)}`,
        `+${formatMs(line.offset)}`.padStart(8),
        formatMs(line.duration).padStart(8),
        `  ${' '.repeat(lead)}${'█'.repeat(Math.min(bar, barWidth - lead))}`,
      ].join(' ')
    }),
  ].join('\n')
}

/** `Server-Timing` metrics: the request, then one per line of the trace. */
function serverTiming(root: Span, total: number, lines: Line[]) {
  // Header values are ASCII, and `desc` is a quoted string.
  const quote = (text: string) => text.replace(/[^\x20-\x7e]|["\\]/g, '')

  return [
    `total;desc="${quote(label(root.name, root.attributes))}";dur=${total.toFixed(1)}`,
    ...lines.map(
      (line, index) =>
        `s${index};desc="${quote(`${'- '.repeat(line.depth)}${line.label}`)}";dur=${line.duration.toFixed(1)}`,
    ),
  ].join(', ')
}

/** Traces every request: `Server-Timing` on the response, a log when slow. */
export const traceRequests: MiddlewareHandler = async (c, next) => {
  const root = startSpan(`${c.req.method} ${c.req.path}`)

  await active.run(root, next)

  const end = performance.now()
  const total = end - root.start
  const lines = traceLines(root, end)

  c.res.headers.append('Server-Timing', serverTiming(root, total, lines))

  if (total >= Number(process.env.TRACE_SLOW_MS || 1000)) {
    console.log(render(root, total, lines))
  }
}
