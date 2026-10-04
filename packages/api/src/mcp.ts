import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { type HostFunctionGroup, RunHostFunctionError } from 'run'

/** `MCP_URL` is missing, or the MCP server couldn't be reached. */
export class McpUnavailableError extends Error {
  name = 'McpUnavailableError'
}

/** Gateway auth headers (`Authorization` + `Arcade-User-ID`), when configured. */
function mcpHeaders() {
  const headers: Record<string, string> = {}

  if (process.env.ARCADE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ARCADE_API_KEY}`
  }
  if (process.env.ARCADE_USER_ID) {
    headers['Arcade-User-ID'] = process.env.ARCADE_USER_ID
  }

  return headers
}

/** Connects to the MCP server at `MCP_URL` for the duration of `fn`. */
export async function withMcpClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const url = process.env.MCP_URL

  if (!url) {
    throw new McpUnavailableError('MCP_URL is not configured')
  }

  const client = new Client({ name: 'template-api', version: '0.0.0' })

  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: mcpHeaders() },
      }),
    )
  } catch (error) {
    throw new McpUnavailableError(
      `Could not connect to the MCP server: ${error instanceof Error ? error.message : error}`,
      { cause: error },
    )
  }

  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

/** MCP tool names can contain characters that aren't valid JS identifiers. */
export function toFunctionName(toolName: string) {
  const name = toolName.replace(/[^A-Za-z0-9_$]/g, '_')
  return /^[0-9]/.test(name) ? `_${name}` : name
}

type ToolContent = { type: string; text?: string }

function textOf(content: ToolContent[]) {
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
}

/**
 * Prefers structured output, then JSON-looking text, then plain text, so
 * scripts get plain values back instead of MCP content envelopes.
 */
function toolResultValue(result: Awaited<ReturnType<Client['callTool']>>) {
  if (!('content' in result)) {
    return result.toolResult
  }

  const content = Array.isArray(result.content) ? result.content : []
  const text = textOf(content)

  if (result.isError) {
    // `run` hides plain host errors from scripts; a RunError keeps its message.
    throw new RunHostFunctionError(text || 'Tool call failed')
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Exposes every tool on the MCP server as `tools.<functionName>(args)`. */
export async function mcpHostFunctions(
  client: Client,
): Promise<HostFunctionGroup> {
  const { tools } = await client.listTools()
  const functions: HostFunctionGroup = {}

  for (const tool of tools) {
    functions[toFunctionName(tool.name)] = async (
      args: Record<string, unknown> = {},
    ) =>
      toolResultValue(
        await client.callTool({ name: tool.name, arguments: args }),
      )
  }

  return functions
}
