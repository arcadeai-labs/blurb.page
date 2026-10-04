// Doc records and the components embedded in them. Browser-safe, like `./app`:
// the frontend parses embeds with the same code the server validates them with.
import { Lexer, marked } from 'marked'
import { z } from 'zod'

import { type AppSpec, slug, specSchema } from './app'

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
      'Markdown. Embed live components as ```ui fenced code blocks holding a json-render spec (see get_doc_guide).',
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

export type ParsedEmbed =
  | { ok: true; spec: AppSpec }
  | { ok: false; errors: string[] }

/** Parses one ```ui block: JSON holding an app spec. */
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

  const result = specSchema.safeParse(json)

  return result.success
    ? { ok: true, spec: result.data }
    : {
        ok: false,
        errors: result.error.issues.map(
          (issue) => `spec.${issue.path.join('.')}: ${issue.message}`,
        ),
      }
}
