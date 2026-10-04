import { getDb } from './db'
import { apps, type Doc, docs, scripts } from './db/schema'
import { docEmbeds, type Embed, parseEmbed } from './ui/doc'
import { referencedScripts, validateApp } from './ui/validate'

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

  const [scriptRows, appRows] = await Promise.all([
    getDb().select({ name: scripts.name }).from(scripts),
    getDb().select({ name: apps.name }).from(apps),
  ])
  const scriptNames = new Set(scriptRows.map((row) => row.name))
  const appNames = new Set(appRows.map((row) => row.name))

  function errors(source: string) {
    const parsed = parseEmbed(source)

    if (!parsed.ok) {
      return parsed.errors
    }
    if (parsed.kind === 'spec') {
      return validateApp({ spec: parsed.spec }, scriptNames)
    }
    return appNames.has(parsed.app)
      ? []
      : [`no app named "${parsed.app}" (see list_apps)`]
  }

  return embeds.flatMap((source, index) =>
    errors(source).map((error) => `ui block ${index + 1}: ${error}`),
  )
}

/** Names of the docs with an embed that matches `test`. */
async function docsWith(test: (embed: Embed) => boolean) {
  const rows = await getDb().select().from(docs)

  return rows
    .filter((doc) =>
      docEmbeds(doc.body).some((source) => {
        const parsed = parseEmbed(source)

        return parsed.ok && test(parsed)
      }),
    )
    .map((doc) => doc.name)
}

/** Names of the docs with a component that runs the script called `scriptName`. */
export function docsRunning(scriptName: string) {
  return docsWith(
    (embed) =>
      embed.kind === 'spec' &&
      referencedScripts({ spec: embed.spec }).has(scriptName),
  )
}

/** Names of the docs that mount the app called `appName`. */
export function docsMounting(appName: string) {
  return docsWith((embed) => embed.kind === 'app' && embed.app === appName)
}
