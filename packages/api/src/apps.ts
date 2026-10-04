import { getDb } from './db'
import { type App, apps, scripts, svgs } from './db/schema'
import type { ActionBinding, AppSpec } from './ui/app'
import { referencedScripts, referencedSvgs, validateApp } from './ui/validate'

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

/** Validates an app, including that every script it runs and SVG it shows exists. */
export async function appErrors(app: {
  spec: AppSpec
  onLoad?: ActionBinding[]
}) {
  const [scriptRows, svgRows] = await Promise.all([
    getDb().select({ name: scripts.name }).from(scripts),
    getDb().select({ name: svgs.name }).from(svgs),
  ])

  return validateApp(app, {
    scripts: new Set(scriptRows.map((row) => row.name)),
    svgs: new Set(svgRows.map((row) => row.name)),
  })
}

/** Names of the apps that run the script called `scriptName`. */
export async function appsRunning(scriptName: string) {
  const rows = await getDb().select().from(apps)

  return rows
    .filter((app) => referencedScripts(app).has(scriptName))
    .map((app) => app.name)
}

/** Names of the apps that show the SVG called `svgName`. */
export async function appsShowing(svgName: string) {
  const rows = await getDb().select().from(apps)

  return rows
    .filter((app) => referencedSvgs(app).has(svgName))
    .map((app) => app.name)
}
