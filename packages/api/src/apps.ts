import { getDb } from './db'
import { type App, apps, scripts } from './db/schema'
import type { ActionBinding, AppSpec } from './ui/app'
import { referencedScripts, validateApp } from './ui/validate'

/** Where the frontend that renders apps is served. */
export function frontendUrl() {
  return (process.env.FRONTEND_URL ?? 'http://127.0.0.1:5173').replace(
    /\/$/,
    '',
  )
}

export function appUrl(name: string) {
  return `${frontendUrl()}/apps/${name}`
}

export function toAppSummary(app: App) {
  return {
    id: app.id,
    name: app.name,
    title: app.title,
    description: app.description,
    url: appUrl(app.name),
    updatedAt: app.updatedAt.toISOString(),
  }
}

export function toAppJson(app: App) {
  return {
    ...toAppSummary(app),
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
