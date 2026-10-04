import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { type HostFunctionGroup, RunHostFunctionError } from 'run'
import { z } from 'zod'

/** The user's MCP gateway couldn't be reached. */
export class McpUnavailableError extends Error {
  name = 'McpUnavailableError'
}

/** An MCP gateway, and the user's Arcade token to call it with. */
export type McpConnection = { url: string; accessToken: string }

/**
 * Connects to the user's MCP gateway for the duration of `fn`, as the user
 * whose Arcade token `connection` carries.
 */
export async function withMcpClient<T>(
  { url, accessToken }: McpConnection,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: 'template-api', version: '0.0.0' })

  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
      }),
    )
  } catch (error) {
    throw new McpUnavailableError(
      `Could not connect to the MCP gateway at ${url}: ${error instanceof Error ? error.message : error}`,
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

/** The tool error Arcade returns when the user hasn't authorized the tool. */
const authorizationResponse = z.object({ authorization_url: z.url() })

/** The authorization URL in a tool error, when it needs authorization. */
function authorizationUrlOf(text: string) {
  try {
    const parsed = authorizationResponse.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data.authorization_url : undefined
  } catch {
    return undefined
  }
}

/**
 * Prefers structured output, then JSON-looking text, then plain text, so
 * scripts get plain values back instead of MCP content envelopes.
 */
function toolResultValue(
  toolName: string,
  result: Awaited<ReturnType<Client['callTool']>>,
  onAuthorizationRequired: (toolName: string, url: string) => void,
) {
  if (!('content' in result)) {
    return result.toolResult
  }

  const content = Array.isArray(result.content) ? result.content : []
  const text = textOf(content)

  if (result.isError) {
    const authorizationUrl = authorizationUrlOf(text)

    // `run` hides plain host errors from scripts; a RunError keeps its message.
    if (authorizationUrl) {
      onAuthorizationRequired(toolName, authorizationUrl)
      throw new RunHostFunctionError(`${toolName} requires authorization`)
    }
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

/**
 * Exposes every tool on the MCP server as `tools.<functionName>(args)`. A tool
 * that needs authorization throws, and its URL goes to `onAuthorizationRequired`
 * (`run` doesn't pass error details through the sandbox).
 */
export async function mcpHostFunctions(
  client: Client,
  onAuthorizationRequired: (toolName: string, url: string) => void,
): Promise<HostFunctionGroup> {
  const { tools } = await client.listTools()
  const functions: HostFunctionGroup = {}

  for (const tool of tools) {
    functions[toFunctionName(tool.name)] = async (
      args: Record<string, unknown> = {},
    ) =>
      toolResultValue(
        tool.name,
        await client.callTool({ name: tool.name, arguments: args }),
        onAuthorizationRequired,
      )
  }

  return functions
}
