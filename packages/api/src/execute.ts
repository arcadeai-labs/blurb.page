import { createRunner, RunError } from 'run'
import { z } from 'zod'

import {
  type McpConnection,
  mcpHostFunctions,
  referencedTools,
  withMcpClient,
} from './mcp'
import { authorizationRequired, type ScriptError } from './script-error'
import { span } from './trace'

const runner = createRunner({ limits: { timeoutMs: 60_000 } })

/**
 * `toolMs` is how long at least one tool call was in flight, so concurrent
 * calls count once. Scripts can't time themselves: the sandbox's `Date` is
 * deterministic.
 */
export type ExecuteResult =
  | { ok: true; value: unknown; toolMs: number }
  | { ok: false; error: ScriptError }

/** Wall time during which at least one wrapped call was running. */
function callClock() {
  let running = 0
  let since = 0
  let ms = 0

  return {
    async time<T>(call: () => Promise<T>) {
      if (running++ === 0) since = performance.now()

      try {
        return await call()
      } finally {
        if (--running === 0) ms += performance.now() - since
      }
    },
    ms: () => Math.round(ms),
  }
}

/**
 * Runs a script in the QuickJS sandbox with `input` as a global and the
 * tools on the user's MCP gateway (`connection`) available as `tools.*`.
 * Invalid input and guest failures come back as `ok: false`, not as
 * exceptions. A failed run whose tool call
 * needed authorization is reported as `AUTHORIZATION_REQUIRED`, even if the
 * script caught and rethrew the tool's error.
 */
export async function executeScript(
  script: { source: string; inputSchema: Record<string, unknown> },
  connection: McpConnection,
  input: unknown = {},
  abortSignal?: AbortSignal,
): Promise<ExecuteResult> {
  const parsed = z.fromJSONSchema(script.inputSchema).safeParse(input)

  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: z.prettifyError(parsed.error) },
    }
  }

  // JSON is a valid JS expression, so the input is inlined as a constant.
  const source = `const input = ${JSON.stringify(parsed.data ?? null)};\n${script.source}`

  return withMcpClient(connection, async (client) => {
    let authorization: { toolName: string; url: string } | undefined
    const toolClock = callClock()

    try {
      const tools = await mcpHostFunctions(client, {
        functionNames: referencedTools(script.source),
        onAuthorizationRequired: (toolName, url) => {
          authorization ??= { toolName, url }
        },
        wrapCall: toolClock.time,
      })
      const result = await span('script.run', () =>
        runner.run({ source, hostFunctions: { tools }, abortSignal }),
      )

      if (result.status !== 'completed') {
        return {
          ok: false,
          error: { code: 'RUN_INTERRUPTED', message: 'Script was interrupted' },
        }
      }

      // The response is JSON, so drop values JSON can't carry (Map, BigInt…).
      return {
        ok: true,
        value: JSON.parse(JSON.stringify(result.value ?? null)),
        toolMs: toolClock.ms(),
      }
    } catch (error) {
      if (!(error instanceof RunError)) {
        throw error
      }

      if (authorization) {
        return {
          ok: false,
          error: {
            code: authorizationRequired,
            message: `${authorization.toolName} needs your authorization. Authorize it, then try again.`,
            authorizationUrl: authorization.url,
          },
        }
      }

      return {
        ok: false,
        error: { code: error.code, message: error.message },
      }
    }
  })
}
