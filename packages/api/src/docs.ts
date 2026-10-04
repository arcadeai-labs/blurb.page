import { getDb } from './db'
import { type Doc, docs, scripts, svgs } from './db/schema'
import { docEmbeds, parseEmbed } from './ui/doc'
import { referencedScripts, referencedSvgs, validateEmbed } from './ui/validate'

export function toDocSummary(doc: Doc, baseUrl: string) {
  return {
    id: doc.id,
    name: doc.name,
    title: doc.title,
    url: `${baseUrl}/docs/${doc.name}`,
    updatedAt: doc.updatedAt.toISOString(),
  }
}

export function toDocJson(doc: Doc, baseUrl: string) {
  return {
    ...toDocSummary(doc, baseUrl),
    body: doc.body,
    createdAt: doc.createdAt.toISOString(),
  }
}

/** Validates every component embedded in a doc's Markdown. */
export async function docErrors(body: string) {
  const embeds = docEmbeds(body)

  if (embeds.length === 0) {
    return []
  }

  const [scriptRows, svgRows] = await Promise.all([
    getDb().select({ name: scripts.name }).from(scripts),
    getDb().select({ name: svgs.name }).from(svgs),
  ])
  const existing = {
    scripts: new Set(scriptRows.map((row) => row.name)),
    svgs: new Set(svgRows.map((row) => row.name)),
  }

  return embeds.flatMap((source, index) => {
    const parsed = parseEmbed(source)
    const errors = parsed.ok
      ? validateEmbed(parsed.spec, existing)
      : parsed.errors

    return errors.map((error) => `ui block ${index + 1}: ${error}`)
  })
}

/** Names of the docs with a component that runs the script called `scriptName`. */
export async function docsRunning(scriptName: string) {
  const rows = await getDb().select().from(docs)

  return rows
    .filter((doc) =>
      docEmbeds(doc.body).some((source) => {
        const parsed = parseEmbed(source)

        return (
          parsed.ok && referencedScripts({ spec: parsed.spec }).has(scriptName)
        )
      }),
    )
    .map((doc) => doc.name)
}

/** Names of the docs with a component that shows the SVG called `svgName`. */
export async function docsShowing(svgName: string) {
  const rows = await getDb().select().from(docs)

  return rows
    .filter((doc) =>
      docEmbeds(doc.body).some((source) => {
        const parsed = parseEmbed(source)

        return parsed.ok && referencedSvgs({ spec: parsed.spec }).has(svgName)
      }),
    )
    .map((doc) => doc.name)
}
