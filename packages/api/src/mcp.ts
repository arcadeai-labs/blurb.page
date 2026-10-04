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

/** The tool functions a script calls, like `Gmail_SendEmail` in `tools.Gmail_SendEmail(…)`. */
export function calledToolNames(source: string) {
  return new Set(
    Array.from(
      source.matchAll(/\btools\s*\.\s*([A-Za-z_$][\w$]*)/g),
      (match) => match[1],
    ),
  )
}

/** The gateway tool that runs any Arcade tool by name, on discovery gateways. */
const useToolName = 'Arcade_UseTool'

/**
 * Exposes every tool on the MCP server as `tools.<functionName>(args)`.
 * Gateways in discovery mode only list Arcade's meta-tools, so a tool the
 * script calls (`called`) that isn't listed runs through `Arcade_UseTool`,
 * which takes the same `Toolkit_Tool` name and returns the same result.
 */
export async function mcpHostFunctions(
  client: Client,
  called: Iterable<string>,
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

  if (tools.some((tool) => tool.name === useToolName)) {
    for (const name of called) {
      functions[name] ??= async (args: Record<string, unknown> = {}) =>
        toolResultValue(
          name,
          await client.callTool({
            name: useToolName,
            arguments: { tool_name: name, inputs: args },
          }),
          onAuthorizationRequired,
        )
    }
  }

  return functions
}
