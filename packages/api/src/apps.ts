import { getDb } from './db'
import { type App, apps, scripts } from './db/schema'
import type { ActionBinding, AppSpec } from './ui/app'
import { referencedScripts, validateApp } from './ui/validate'

/**
 * Where apps are rendered. The frontend serves the API, so that's the origin
 * `request` came in on, unless `FRONTEND_URL` overrides it (for example behind
 * a proxy that terminates TLS).
 */
export function frontendUrl(request: Request) {
  return (process.env.FRONTEND_URL ?? new URL(request.url).origin).replace(
    /\/$/,
    '',
  )
}

export function toAppSummary(app: App, baseUrl: string) {
  return {
    id: app.id,
    name: app.name,
    title: app.title,
    description: app.description,
    url: `${baseUrl}/apps/${app.name}`,
    updatedAt: app.updatedAt.toISOString(),
  }
}

export function toAppJson(app: App, baseUrl: string) {
  return {
    ...toAppSummary(app, baseUrl),
    spec: app.spec,
    onLoad: app.onLoad,
    createdAt: app.createdAt.toISOString(),
  }
}

/** Validates an app, including that every script it runs exists. */
export async function appErrors(app: {
  spec: AppSpec
  onLoad?: ActionBinding[]
}) {
  const rows = await getDb().select({ name: scripts.name }).from(scripts)

  return validateApp(app, new Set(rows.map((row) => row.name)))
}

/** Names of the apps that run the script called `scriptName`. */
export async function appsRunning(scriptName: string) {
  const rows = await getDb().select().from(apps)

  return rows
    .filter((app) => referencedScripts(app).has(scriptName))
    .map((app) => app.name)
}
