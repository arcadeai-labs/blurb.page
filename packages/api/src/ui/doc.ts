// Doc records and the components embedded in them. Browser-safe, like `./app`:
// the frontend parses embeds with the same code the server validates them with.
import { Lexer, marked } from 'marked'
import { z } from 'zod'

import { type AppSpec, appName, slug, specSchema } from './app'

export const docName = slug.describe(
  'Slug-friendly name, used in the doc URL, e.g. `q3-review`',
)

/** Language of the fenced code blocks that embed a component in a doc. */
export const embedLanguage = 'ui'

/** Fields accepted when creating a doc; updates take any subset. */
export const docFields = {
  name: docName,
  title: z
    .string()
    .trim()
    .min(1)
    .describe('A few words, shown in the navbar as the page title'),
  body: z
    .string()
    .describe(
      'Markdown. Embed live components as ```ui fenced code blocks holding a json-render spec, or { "app": "<name>" } to mount a saved app (see get_doc_guide).',
    ),
}

export const docSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  title: z.string(),
  url: z.string(),
  updatedAt: z.iso.datetime(),
})

export type DocSummary = z.infer<typeof docSummarySchema>

export const docSchema = docSummarySchema.extend({
  body: z.string(),
  createdAt: z.iso.datetime(),
})

export type Doc = z.infer<typeof docSchema>

/** The source of every ```ui block in a doc's Markdown, in document order. */
export function docEmbeds(body: string) {
  const sources: string[] = []

  // Walks nested tokens too, since embeds may sit inside lists and quotes.
  marked.walkTokens(Lexer.lex(body), (token) => {
    if (
      token.type === 'code' &&
      token.codeBlockStyle !== 'indented' &&
      token.lang === embedLanguage
    ) {
      sources.push(token.text)
    }
  })

  return sources
}

const embedHeight = z
  .number()
  .int()
  .min(120)
  .max(2000)
  .optional()
  .describe(
    'Height of the block in px. Blocks that hold something that fills its parent (a ScrollArea without a height, Slides) default to 600; others take the height of their content.',
  )

/** A block that mounts a saved app, kept up to date with it. */
const appEmbedSchema = z.strictObject({
  app: appName.describe('Name of the app to mount'),
  height: embedHeight,
})

/** A block that holds its own spec. */
const specEmbedSchema = specSchema.extend({ height: embedHeight })

/** What a ```ui block shows: its own spec, or a saved app. */
export type Embed =
  | { kind: 'spec'; spec: AppSpec; height?: number }
  | { kind: 'app'; app: string; height?: number }

export type ParsedEmbed =
  | ({ ok: true } & Embed)
  | { ok: false; errors: string[] }

/** Readable errors, with paths under `prefix` (e.g. `spec.elements.x`). */
function issues(error: z.ZodError, prefix?: string) {
  return error.issues.map((issue) => {
    const path = [prefix, ...issue.path].filter((key) => key !== undefined)

    return path.length > 0
      ? `${path.join('.')}: ${issue.message}`
      : issue.message
  })
}

/**
 * Parses one ```ui block: JSON holding either an app spec, or
 * `{ "app": "<name>" }` to mount a saved app. Either may set a height.
 */
export function parseEmbed(source: string): ParsedEmbed {
  let json: unknown

  try {
    json = JSON.parse(source)
  } catch (error) {
    return {
      ok: false,
      errors: [
        `not valid JSON (${error instanceof Error ? error.message : String(error)})`,
      ],
    }
  }

  if (typeof json === 'object' && json !== null && 'app' in json) {
    const result = appEmbedSchema.safeParse(json)

    return result.success
      ? { ok: true, kind: 'app', ...result.data }
      : { ok: false, errors: issues(result.error) }
  }

  const result = specEmbedSchema.safeParse(json)

  if (!result.success) {
    return { ok: false, errors: issues(result.error, 'spec') }
  }

  const { height, ...spec } = result.data

  return { ok: true, kind: 'spec', spec, height }
}
