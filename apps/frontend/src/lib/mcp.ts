import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  appSchema,
  appSummarySchema,
  docSchema,
  docSummarySchema,
  scriptErrorSchema,
  svgSchema,
} from '@template/api/ui'
import { z } from 'zod'

// The frontend talks to the API's MCP server, the same interface agents use
// to build apps: apps are loaded with `get_app` and run scripts with
// `execute_script`. This server serves it at `/mcp` (see `routes/mcp.ts`).
export const mcpPath = '/mcp'

let connection: Promise<Client> | undefined

/** One client per page; the server is stateless, so it never goes stale. */
function getClient() {
  connection ??= (async () => {
    const client = new Client({ name: 'every-ui-frontend', version: '0.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcpPath, window.location.href)),
    )
    return client
  })().catch((error: unknown) => {
    connection = undefined
    throw error
  })

  return connection
}

const textContent = z.array(
  z.object({ type: z.string(), text: z.string().optional() }),
)

const scriptFailure = z.object({ error: scriptErrorSchema })

/** A script failed because the user hasn't authorized a tool it calls yet. */
export class AuthorizationRequiredError extends Error {
  name = 'AuthorizationRequiredError'
  readonly authorizationUrl: string

  constructor(message: string, authorizationUrl: string) {
    super(message)
    this.authorizationUrl = authorizationUrl
  }
}

/**
 * Calls a tool and parses its structured result, throwing on tool errors
 * (an AuthorizationRequiredError when a script needs authorization).
 */
async function callTool<T extends z.ZodType>(
  name: string,
  args: Record<string, unknown>,
  schema: T,
): Promise<z.infer<T>> {
  const client = await getClient()
  const result = await client.callTool({ name, arguments: args })

  if (result.isError) {
    const failure = scriptFailure.safeParse(result.structuredContent)

    if (failure.success && failure.data.error.authorizationUrl) {
      throw new AuthorizationRequiredError(
        failure.data.error.message,
        failure.data.error.authorizationUrl,
      )
    }

    const content = textContent.safeParse(result.content)
    const message = content.success
      ? content.data.map((part) => part.text ?? '').join('\n')
      : ''
    throw new Error(message || `${name} failed`)
  }

  return schema.parse(result.structuredContent)
}

export function listApps() {
  return callTool(
    'list_apps',
    {},
    z.object({ apps: z.array(appSummarySchema) }),
  )
}

export function getApp(name: string) {
  return callTool('get_app', { name }, appSchema)
}

export function getSvg(name: string) {
  return callTool('get_svg', { name }, svgSchema)
}

export async function executeScript(name: string, input: unknown) {
  const { value } = await callTool(
    'execute_script',
    { name, input },
    z.object({ value: z.unknown() }),
  )
  return value
}

export function listDocs() {
  return callTool(
    'list_docs',
    {},
    z.object({ docs: z.array(docSummarySchema) }),
  )
}

export function getDoc(name: string) {
  return callTool('get_doc', { name }, docSchema)
}

export function createDoc(doc: { name: string; title: string; body: string }) {
  return callTool('create_doc', doc, docSchema)
}

export function updateDoc(
  id: string,
  values: { name?: string; title?: string; body?: string },
) {
  return callTool('update_doc', { id, ...values }, docSchema)
}

export function deleteDoc(id: string) {
  return callTool('delete_doc', { id }, z.object({ id: z.string() }))
}
