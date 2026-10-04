import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import {
  appErrors,
  appsRunning,
  appsShowing,
  frontendUrl,
  toAppJson,
  toAppSummary,
} from './apps'
import { mcpConnection, SignInRequiredError, withMcpUser } from './auth'
import { getDb } from './db'
import { isUniqueViolation } from './db/errors'
import { apps, docs, type Script, scripts, svgs } from './db/schema'
import {
  docErrors,
  docsMounting,
  docsRunning,
  docsShowing,
  toDocJson,
  toDocSummary,
} from './docs'
import { executeScript } from './execute'
import {
  type McpConnection,
  McpUnavailableError,
  toFunctionName,
  withMcpClient,
} from './mcp'
import type { ScriptError } from './script-error'
import { scriptFields, scriptName } from './script-fields'
import { svgFields, svgName } from './svg-fields'
import { toSvgJson, toSvgSummary } from './svgs'
import { appFields, appName } from './ui/app'
import { docFields, docName } from './ui/doc'
import { appGuide, docGuide } from './ui/guide'

function toJson(script: Script) {
  return {
    ...script,
    createdAt: script.createdAt.toISOString(),
    updatedAt: script.updatedAt.toISOString(),
  }
}

/** Returns `value` as both structured content and JSON text. */
function ok(value: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  }
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/**
 * Reports a failed script run, with the error as structured content too so
 * clients can tell an authorization prompt from other failures.
 */
function scriptFailed(error: ScriptError): CallToolResult {
  const text = error.authorizationUrl
    ? `${error.code}: ${error.message} Show the user this link to authorize, then retry: ${error.authorizationUrl}`
    : `${error.code}: ${error.message}`

  return { ...fail(text), structuredContent: { error } }
}

const scriptNotFound = () => fail('Script not found')

const appNotFound = () => fail('App not found')

const docNotFound = () => fail('Doc not found')

const svgNotFound = () => fail('SVG not found')

function invalidApp(errors: string[]) {
  return fail(
    `The app is invalid. Fix these and retry (see get_app_guide):\n- ${errors.join('\n- ')}`,
  )
}

function invalidDoc(errors: string[]) {
  return fail(
    `The doc has invalid components. Fix these and retry (see get_doc_guide):\n- ${errors.join('\n- ')}`,
  )
}

/**
 * Reports an unreachable upstream MCP server, or an Arcade session that has
 * to be renewed, as a tool error.
 */
async function upstream(fn: () => Promise<CallToolResult>) {
  try {
    return await fn()
  } catch (error) {
    if (
      error instanceof McpUnavailableError ||
      error instanceof SignInRequiredError
    ) {
      return fail(error.message)
    }
    throw error
  }
}

/** Reports a taken name as a tool error; `kind` is e.g. "A script". */
async function uniqueName(kind: string, fn: () => Promise<CallToolResult>) {
  try {
    return await fn()
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(`${kind} with that name already exists`)
    }
    throw error
  }
}

/** The apps and docs that run the script called `scriptName`, labelled. */
async function scriptUsers(scriptName: string) {
  const [appNames, docNames] = await Promise.all([
    appsRunning(scriptName),
    docsRunning(scriptName),
  ])

  return [
    ...appNames.map((name) => `app ${name}`),
    ...docNames.map((name) => `doc ${name}`),
  ]
}

/** The apps and docs that show the SVG called `svgName`, labelled. */
async function svgUsers(svgName: string) {
  const [appNames, docNames] = await Promise.all([
    appsShowing(svgName),
    docsShowing(svgName),
  ])

  return [
    ...appNames.map((name) => `app ${name}`),
    ...docNames.map((name) => `doc ${name}`),
  ]
}

/** Adds a note listing apps and docs (e.g. those that run a script), when there are any. */
function withAppsNote(result: CallToolResult, names: string[], note: string) {
  if (names.length === 0) {
    return result
  }

  return {
    ...result,
    content: [
      ...result.content,
      { type: 'text' as const, text: `${note}: ${names.join(', ')}` },
    ],
  }
}

const scriptId = z.uuid().describe('Script ID')

const appId = z.uuid().describe('App ID')

const docId = z.uuid().describe('Doc ID')

const svgId = z.uuid().describe('SVG ID')

/** Looks a row up by `id` or `name`, whichever was given. */
function idOrName<
  T extends typeof scripts | typeof apps | typeof docs | typeof svgs,
>(table: T, args: { id?: string; name?: string }) {
  if (args.id) {
    return eq(table.id, args.id)
  }
  if (args.name) {
    return eq(table.name, args.name)
  }
  return undefined
}

function instructions(baseUrl: string) {
  return `Build web apps (UIs, forms, tables, charts, dashboards, slideshows) backed by integration tools.

- Scripts are server-side JavaScript that call the upstream integration tools (list_script_tools) as \`await tools.<functionName>(args)\`, take a validated \`input\` and return JSON.
- Apps are json-render UI specs rendered with shadcn/ui at ${baseUrl}/apps/<name>. Their buttons, forms and load hooks run scripts by name (the runScript action) and render the results.
- SVGs are saved images (diagrams, illustrations, icons) that apps show by name with the Svg component. Create them with create_svg.

Before creating or changing an app, call get_app_guide once: it documents the spec format, every component and action, and patterns for loading data, forms, tables, charts and row actions. Typical flow: list_script_tools → create_script (one per data operation; test with execute_script) → create_app → share the returned url. Use the list_/get_/update_/delete_ tools to change existing scripts and apps.

Less is more: build only what the user asked for, with the fewest elements that do it. No headings, intro text or other filler (the navbar already shows the app's title and description), and no features nobody asked for.

Fit the page: an app fills whatever it's shown in (its page, or a block in a doc) and shouldn't scroll as a whole. Put anything that grows with data (tables, lists, message bodies) in a ScrollArea so it scrolls on its own; side-by-side panes each get a ScrollArea that fills the space left in them.

Docs are Notion-like Markdown pages at ${baseUrl}/docs/<name> that people also edit in the browser. They embed live components (the same json-render specs, or saved apps mounted by name, in \`\`\`ui code blocks) between paragraphs. Call get_doc_guide before create_doc or update_doc.`
}

/**
 * The API's operations, exposed as MCP tools. `baseUrl` is where apps are
 * rendered, and `connection` gets the user's MCP gateway and token.
 */
function createMcpServer(
  baseUrl: string,
  connection: () => Promise<McpConnection>,
) {
  const server = new McpServer(
    { name: 'every-ui', version: '0.0.0' },
    { instructions: instructions(baseUrl) },
  )

  server.registerTool(
    'get_stats',
    {
      description: 'Read API runtime stats',
      annotations: { readOnlyHint: true },
    },
    () =>
      ok({
        region: process.env.REGION ?? 'local',
        uptimeMode: 'long-lived Node process',
        features: ['Hono API', 'Drizzle', 'Run SDK', 'MCP tools'],
      }),
  )

  server.registerTool(
    'get_app_guide',
    {
      description:
        'How to build apps: the workflow, how scripts and apps fit together, the json-render spec format, every component and action with their props, expressions, and a complete example. Read it before create_app or update_app.',
      annotations: { readOnlyHint: true },
    },
    () => ({ content: [{ type: 'text', text: appGuide(baseUrl) }] }),
  )

  server.registerTool(
    'list_script_tools',
    {
      description:
        "List the tools on the user's MCP gateway that scripts can call as `tools.<functionName>(args)`",
      annotations: { readOnlyHint: true },
    },
    () =>
      upstream(async () => {
        const { tools } = await withMcpClient(await connection(), (client) =>
          client.listTools(),
        )

        return ok({
          tools: tools.map((tool) => ({
            name: tool.name,
            functionName: toFunctionName(tool.name),
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        })
      }),
  )

  server.registerTool(
    'list_scripts',
    { description: 'List scripts', annotations: { readOnlyHint: true } },
    async () => {
      const rows = await getDb()
        .select()
        .from(scripts)
        .orderBy(desc(scripts.updatedAt))

      return ok({ scripts: rows.map(toJson) })
    },
  )

  server.registerTool(
    'get_script',
    {
      description: 'Get a script by id or name',
      inputSchema: { id: scriptId.optional(), name: scriptName.optional() },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const where = idOrName(scripts, args)

      if (!where) {
        return fail('Pass an id or a name')
      }

      const [script] = await getDb().select().from(scripts).where(where)

      return script ? ok(toJson(script)) : scriptNotFound()
    },
  )

  server.registerTool(
    'create_script',
    {
      description:
        'Create a script: the body of an async JavaScript function with `input` and `tools.*` in scope, returning JSON. Apps run it by its (unique) name.',
      inputSchema: scriptFields,
    },
    (args) =>
      uniqueName('A script', async () => {
        const [script] = await getDb().insert(scripts).values(args).returning()

        return ok(toJson(script))
      }),
  )

  server.registerTool(
    'update_script',
    {
      description:
        'Update a script. Fields left out are kept. Renaming breaks apps that run it by the old name.',
      inputSchema: { id: scriptId, ...z.object(scriptFields).partial().shape },
      annotations: { idempotentHint: true },
    },
    ({ id, ...values }) =>
      uniqueName('A script', async () => {
        const [previous] = await getDb()
          .select({ name: scripts.name })
          .from(scripts)
          .where(eq(scripts.id, id))
        const [script] = await getDb()
          .update(scripts)
          .set(values)
          .where(eq(scripts.id, id))
          .returning()

        if (!script || !previous) {
          return scriptNotFound()
        }

        return previous.name === script.name
          ? ok(toJson(script))
          : withAppsNote(
              ok(toJson(script)),
              await scriptUsers(previous.name),
              `Renamed from "${previous.name}"; update these apps and docs, which still run the old name`,
            )
      }),
  )

  server.registerTool(
    'delete_script',
    {
      description: 'Delete a script',
      inputSchema: { id: scriptId },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (args) => {
      const [script] = await getDb()
        .delete(scripts)
        .where(eq(scripts.id, args.id))
        .returning({ id: scripts.id, name: scripts.name })

      if (!script) {
        return scriptNotFound()
      }

      return withAppsNote(
        ok({ id: script.id }),
        await scriptUsers(script.name),
        'These apps and docs still run the deleted script',
      )
    },
  )

  server.registerTool(
    'execute_script',
    {
      description:
        'Run a script (by id or name) in the sandbox with the given input, exactly as an app would. Every tool on the MCP gateway the user picked is available to it as `tools.<functionName>(args)`. Returns `{ value }`. If a tool needs the user to authorize it first, it fails with AUTHORIZATION_REQUIRED and a link to show the user.',
      inputSchema: {
        id: scriptId.optional(),
        name: scriptName.optional(),
        input: z
          .unknown()
          .optional()
          .describe("Validated against the script's inputSchema"),
      },
      annotations: { openWorldHint: true },
    },
    async (args, extra) => {
      const where = idOrName(scripts, args)

      if (!where) {
        return fail('Pass an id or a name')
      }

      const [script] = await getDb().select().from(scripts).where(where)

      if (!script) {
        return scriptNotFound()
      }

      return upstream(async () => {
        const result = await executeScript(
          script,
          await connection(),
          args.input,
          extra.signal,
        )

        return result.ok
          ? ok({ value: result.value })
          : scriptFailed(result.error)
      })
    },
  )

  server.registerTool(
    'list_apps',
    {
      description: 'List apps with their URLs (without specs)',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await getDb()
        .select()
        .from(apps)
        .orderBy(desc(apps.updatedAt))

      return ok({ apps: rows.map((app) => toAppSummary(app, baseUrl)) })
    },
  )

  server.registerTool(
    'get_app',
    {
      description: 'Get an app, including its spec and onLoad, by id or name',
      inputSchema: { id: appId.optional(), name: appName.optional() },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const where = idOrName(apps, args)

      if (!where) {
        return fail('Pass an id or a name')
      }

      const [app] = await getDb().select().from(apps).where(where)

      return app ? ok(toAppJson(app, baseUrl)) : appNotFound()
    },
  )

  server.registerTool(
    'create_app',
    {
      description:
        'Create an app: a json-render spec whose actions run scripts by name. Read get_app_guide first. The spec is validated (components, props, actions, script names, element tree) and rejected with a list of errors if invalid. Returns the app with its url.',
      inputSchema: appFields,
    },
    async (args) => {
      const errors = await appErrors(args)

      if (errors.length > 0) {
        return invalidApp(errors)
      }

      return uniqueName('An app', async () => {
        const [app] = await getDb().insert(apps).values(args).returning()

        return ok(toAppJson(app, baseUrl))
      })
    },
  )

  server.registerTool(
    'update_app',
    {
      description:
        'Update an app. Fields left out are kept; spec and onLoad are replaced as a whole. Validated like create_app.',
      inputSchema: { id: appId, ...z.object(appFields).partial().shape },
      annotations: { idempotentHint: true },
    },
    async ({ id, ...values }) => {
      const [existing] = await getDb()
        .select()
        .from(apps)
        .where(eq(apps.id, id))

      if (!existing) {
        return appNotFound()
      }

      const errors = await appErrors({
        spec: values.spec ?? existing.spec,
        onLoad: values.onLoad ?? existing.onLoad,
      })

      if (errors.length > 0) {
        return invalidApp(errors)
      }

      return uniqueName('An app', async () => {
        const [app] = await getDb()
          .update(apps)
          .set(values)
          .where(eq(apps.id, id))
          .returning()

        if (!app) {
          return appNotFound()
        }

        return withAppsNote(
          ok(toAppJson(app, baseUrl)),
          existing.name === app.name ? [] : await docsMounting(existing.name),
          `Renamed from "${existing.name}"; update these docs, which still mount the old name`,
        )
      })
    },
  )

  server.registerTool(
    'delete_app',
    {
      description: 'Delete an app (its scripts are kept)',
      inputSchema: { id: appId },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (args) => {
      const [app] = await getDb()
        .delete(apps)
        .where(eq(apps.id, args.id))
        .returning({ id: apps.id, name: apps.name })

      if (!app) {
        return appNotFound()
      }

      return withAppsNote(
        ok({ id: app.id }),
        await docsMounting(app.name),
        'These docs still mount the deleted app',
      )
    },
  )

  server.registerTool(
    'get_doc_guide',
    {
      description:
        'How to write docs: the Markdown they support, how to embed live components in ```ui blocks, and an example. Read it before create_doc or update_doc.',
      annotations: { readOnlyHint: true },
    },
    () => ({ content: [{ type: 'text', text: docGuide(baseUrl) }] }),
  )

  server.registerTool(
    'list_docs',
    {
      description: 'List docs with their URLs (without bodies)',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await getDb()
        .select()
        .from(docs)
        .orderBy(desc(docs.updatedAt))

      return ok({ docs: rows.map((doc) => toDocSummary(doc, baseUrl)) })
    },
  )

  server.registerTool(
    'get_doc',
    {
      description: 'Get a doc, including its Markdown body, by id or name',
      inputSchema: { id: docId.optional(), name: docName.optional() },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const where = idOrName(docs, args)

      if (!where) {
        return fail('Pass an id or a name')
      }

      const [doc] = await getDb().select().from(docs).where(where)

      return doc ? ok(toDocJson(doc, baseUrl)) : docNotFound()
    },
  )

  server.registerTool(
    'create_doc',
    {
      description:
        'Create a doc: a Markdown page whose ```ui blocks are live components. Read get_doc_guide first. Each component is validated like an app spec and the doc is rejected with a list of errors if any is invalid. Returns the doc with its url.',
      inputSchema: docFields,
    },
    async (args) => {
      const errors = await docErrors(args.body)

      if (errors.length > 0) {
        return invalidDoc(errors)
      }

      return uniqueName('A doc', async () => {
        const [doc] = await getDb().insert(docs).values(args).returning()

        return ok(toDocJson(doc, baseUrl))
      })
    },
  )

  server.registerTool(
    'update_doc',
    {
      description:
        'Update a doc. Fields left out are kept; body is replaced as a whole, so get_doc first to keep edits people made. Validated like create_doc.',
      inputSchema: { id: docId, ...z.object(docFields).partial().shape },
      annotations: { idempotentHint: true },
    },
    async ({ id, ...values }) => {
      const errors =
        values.body === undefined ? [] : await docErrors(values.body)

      if (errors.length > 0) {
        return invalidDoc(errors)
      }

      return uniqueName('A doc', async () => {
        const [doc] = await getDb()
          .update(docs)
          .set(values)
          .where(eq(docs.id, id))
          .returning()

        return doc ? ok(toDocJson(doc, baseUrl)) : docNotFound()
      })
    },
  )

  server.registerTool(
    'delete_doc',
    {
      description: 'Delete a doc (the scripts its components run are kept)',
      inputSchema: { id: docId },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (args) => {
      const [doc] = await getDb()
        .delete(docs)
        .where(eq(docs.id, args.id))
        .returning({ id: docs.id })

      return doc ? ok({ id: doc.id }) : docNotFound()
    },
  )

  server.registerTool(
    'list_svgs',
    {
      description: 'List SVGs (without their markup)',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await getDb()
        .select()
        .from(svgs)
        .orderBy(desc(svgs.updatedAt))

      return ok({ svgs: rows.map(toSvgSummary) })
    },
  )

  server.registerTool(
    'get_svg',
    {
      description: 'Get an SVG, including its markup, by id or name',
      inputSchema: { id: svgId.optional(), name: svgName.optional() },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const where = idOrName(svgs, args)

      if (!where) {
        return fail('Pass an id or a name')
      }

      const [row] = await getDb().select().from(svgs).where(where)

      return row ? ok(toSvgJson(row)) : svgNotFound()
    },
  )

  server.registerTool(
    'create_svg',
    {
      description:
        'Save an SVG image (a diagram, illustration, icon or logo) that apps show by its (unique) name with { "type": "Svg", "props": { "name": "<name>" } }.',
      inputSchema: svgFields,
    },
    (args) =>
      uniqueName('An SVG', async () => {
        const [row] = await getDb().insert(svgs).values(args).returning()

        return ok(toSvgJson(row))
      }),
  )

  server.registerTool(
    'update_svg',
    {
      description:
        'Update an SVG. Fields left out are kept. Apps showing it update too; renaming breaks apps that show it by the old name.',
      inputSchema: { id: svgId, ...z.object(svgFields).partial().shape },
      annotations: { idempotentHint: true },
    },
    ({ id, ...values }) =>
      uniqueName('An SVG', async () => {
        const [previous] = await getDb()
          .select({ name: svgs.name })
          .from(svgs)
          .where(eq(svgs.id, id))
        const [row] = await getDb()
          .update(svgs)
          .set(values)
          .where(eq(svgs.id, id))
          .returning()

        if (!row || !previous) {
          return svgNotFound()
        }

        return previous.name === row.name
          ? ok(toSvgJson(row))
          : withAppsNote(
              ok(toSvgJson(row)),
              await svgUsers(previous.name),
              `Renamed from "${previous.name}"; update these apps and docs, which still show the old name`,
            )
      }),
  )

  server.registerTool(
    'delete_svg',
    {
      description: 'Delete an SVG',
      inputSchema: { id: svgId },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (args) => {
      const [row] = await getDb()
        .delete(svgs)
        .where(eq(svgs.id, args.id))
        .returning({ id: svgs.id, name: svgs.name })

      if (!row) {
        return svgNotFound()
      }

      return withAppsNote(
        ok({ id: row.id }),
        await svgUsers(row.name),
        'These apps and docs still show the deleted SVG',
      )
    },
  )

  return server
}

/**
 * Handles a Streamable HTTP MCP request, as the signed-in user or the user who
 * authorized the client. Stateless: every request gets a fresh server and
 * transport, so nothing has to be kept between requests.
 */
export async function handleMcpRequest(request: Request) {
  // A stateless server never pushes messages, so it offers no standalone SSE
  // stream; 405 tells clients not to hold one open.
  if (request.method === 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  }

  return withMcpUser(request, async (auth, userId) => {
    const server = createMcpServer(frontendUrl(request), () =>
      mcpConnection(auth, userId),
    )
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    await server.connect(transport)

    return transport.handleRequest(request)
  })
}
