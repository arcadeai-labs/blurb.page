import { createRunner, RunError } from 'run'
import { z } from 'zod'

import { mcpHostFunctions, withMcpClient } from './mcp'

const runner = createRunner({ limits: { timeoutMs: 60_000 } })

export type ExecuteResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }

/**
 * Runs a script in the QuickJS sandbox with `input` as a global and the MCP
 * server's tools available as `tools.*`. Invalid input and guest failures
 * come back as `ok: false`, not as exceptions.
 */
export async function executeScript(
  script: { source: string; inputSchema: Record<string, unknown> },
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

  return withMcpClient(async (client) => {
    try {
      const result = await runner.run({
        source,
        hostFunctions: { tools: await mcpHostFunctions(client) },
        abortSignal,
      })

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
      }
    } catch (error) {
      if (error instanceof RunError) {
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        }
      }
      throw error
    }
  })
}
