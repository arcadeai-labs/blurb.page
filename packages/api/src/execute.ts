import { createRunner, RunError } from 'run'

import { mcpHostFunctions, withMcpClient } from './mcp'

const runner = createRunner({ limits: { timeoutMs: 60_000 } })

export type ExecuteResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }

/**
 * Runs `source` in the QuickJS sandbox with the MCP server's tools available
 * as `tools.*`. Guest failures come back as `ok: false`, not as exceptions.
 */
export async function executeScript(
  source: string,
  abortSignal?: AbortSignal,
): Promise<ExecuteResult> {
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
