import { z } from 'zod'

/**
 * A tool the script called needs the user to authorize an integration first.
 * The error carries the URL to do it at; retrying afterwards succeeds.
 */
export const authorizationRequired = 'AUTHORIZATION_REQUIRED'

/** Why a script run failed, as returned by the API and `execute_script`. */
export const scriptErrorSchema = z.object({
  code: z
    .string()
    .describe(
      `INVALID_INPUT, ${authorizationRequired}, RUN_INTERRUPTED or a run SDK error code`,
    ),
  message: z.string(),
  authorizationUrl: z
    .url()
    .optional()
    .describe(
      `Set with ${authorizationRequired}: where the user authorizes the integration`,
    ),
})

export type ScriptError = z.infer<typeof scriptErrorSchema>
