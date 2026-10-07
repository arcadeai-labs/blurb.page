import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpError, type Tool } from '@modelcontextprotocol/sdk/types.js'
import { type HostFunctionGroup, RunHostFunctionError } from 'run'
import { z } from 'zod'

import { annotate, span } from './trace'

/** The user's MCP gateway couldn't be reached. */
export class McpUnavailableError extends Error {
  name = 'McpUnavailableError'
}

/**
 * Gateways in discovery mode (like Arcade's global gateway) list only Arcade's
 * meta-tools (`Arcade_SelectTools`, `Arcade_UseTool`) instead of their tools.
 * Scripts call tools by name, so every gateway is asked for its tools as-is,
 * unless `toolRecommendation` asks for those meta-tools (to search with).
 */
export function gatewayUrl(url: string, toolRecommendation = false) {
  const withOptions = new URL(url)
  withOptions.searchParams.set(
    'tool_recommendation',
    String(toolRecommendation),
  )
  return withOptions
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
  { toolRecommendation = false }: { toolRecommendation?: boolean } = {},
): Promise<T> {
  const client = new Client({ name: 'template-api', version: '0.0.0' })

  try {
    await span('gateway.connect', () =>
      client.connect(
        new StreamableHTTPClientTransport(gatewayUrl(url, toolRecommendation), {
          requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
        }),
      ),
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
    await span('gateway.close', () => client.close())
  }
}

/**
 * Every tool on the server. `tools/list` is paginated (Arcade's gateways send
 * 100 tools a page), so this follows `nextCursor` to the end.
 */
export function listAllTools(client: Client) {
  return span('gateway.listTools', async () => {
    const tools: Tool[] = []
    let cursor: string | undefined

    do {
      const page = await span('tools/list page', () =>
        client.listTools(cursor ? { cursor } : undefined),
      )
      tools.push(...page.tools)
      cursor = page.nextCursor
    } while (cursor)

    annotate({ tools: tools.length })
    return tools
  })
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
 * The functions a script calls as `tools.<functionName>`, or `null` when it
 * uses `tools` any other way (`tools[name]`, destructuring, passing it on), so
 * it needs every tool. A `tools` in a comment or string also means `null`.
 */
export function referencedTools(source: string): string[] | null {
  const calls = [...source.matchAll(/\btools\s*\??\.\s*([A-Za-z_$][\w$]*)/g)]
  const uses = source.match(/\btools\b/g)?.length ?? 0

  if (calls.length !== uses) {
    return null
  }

  return [...new Set(calls.flatMap(([, name]) => (name ? [name] : [])))]
}

type HostFunctionOptions = {
  /** The functions the script calls, or `null` for every tool. */
  functionNames: string[] | null
  onAuthorizationRequired: (toolName: string, url: string) => void
  /** Runs every tool call, e.g. to time it. */
  wrapCall?: <T>(call: () => Promise<T>) => Promise<T>
}

/**
 * Exposes the MCP server's tools as `tools.<functionName>(args)`. A tool that
 * needs authorization throws, and its URL goes to `onAuthorizationRequired`
 * (`run` doesn't pass error details through the sandbox).
 *
 * Listing a large gateway's tools takes seconds (a request per 100 tools), so
 * the functions in `functionNames` call the tool of the same name, and the
 * list is only fetched for a name the gateway doesn't know: a tool whose name
 * isn't a valid identifier (see `toFunctionName`).
 */
export async function mcpHostFunctions(
  client: Client,
  {
    functionNames,
    onAuthorizationRequired,
    wrapCall = (call) => call(),
  }: HostFunctionOptions,
): Promise<HostFunctionGroup> {
  let toolNames: Promise<Map<string, string>> | undefined
  const listToolNames = () => {
    toolNames ??= listAllTools(client).then(
      (tools) =>
        new Map(tools.map((tool) => [toFunctionName(tool.name), tool.name])),
    )
    return toolNames
  }

  const call = async (toolName: string, args: Record<string, unknown>) =>
    toolResultValue(
      toolName,
      await wrapCall(() =>
        span(`tool ${toolName}`, () =>
          client.callTool({ name: toolName, arguments: args }),
        ),
      ),
      onAuthorizationRequired,
    )

  if (!functionNames) {
    return Object.fromEntries(
      [...(await listToolNames())].map(([functionName, toolName]) => [
        functionName,
        (args: Record<string, unknown> = {}) => call(toolName, args),
      ]),
    )
  }

  return Object.fromEntries(
    functionNames.map((functionName) => [
      functionName,
      async (args: Record<string, unknown> = {}) => {
        try {
          return await call(functionName, args)
        } catch (error) {
          if (!(error instanceof McpError)) {
            throw error
          }

          const toolName = (await listToolNames()).get(functionName)

          if (!toolName) {
            throw new RunHostFunctionError(
              `tools.${functionName} isn't a tool on the MCP gateway`,
            )
          }
          if (toolName === functionName) {
            throw error
          }
          return call(toolName, args)
        }
      },
    ]),
  )
}
