import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { appSchema, appSummarySchema } from '@template/api/ui'
import { z } from 'zod'
import { apiBaseUrl } from './api-url'

// The frontend talks to the API's MCP server, the same interface agents use
// to build apps: apps are loaded with `get_app` and run scripts with
// `execute_script`. In dev, Vite proxies `/mcp` to the API server.
export const mcpPath = `${apiBaseUrl}/mcp`

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

/** Calls a tool and parses its structured result, throwing on tool errors. */
async function callTool<T extends z.ZodType>(
  name: string,
  args: Record<string, unknown>,
  schema: T,
): Promise<z.infer<T>> {
  const client = await getClient()
  const result = await client.callTool({ name, arguments: args })

  if (result.isError) {
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

export async function executeScript(name: string, input: unknown) {
  const { value } = await callTool(
    'execute_script',
    { name, input },
    z.object({ value: z.unknown() }),
  )
  return value
}
