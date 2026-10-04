import { z } from 'zod'

/** Lowercase words joined by single hyphens, e.g. `list-unread-emails`. */
export const scriptName = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: 'Name must be a slug: lowercase letters, digits and single hyphens',
  })
  .max(64)
  .describe('Slug-friendly name, e.g. `list-unread-emails`')

export const scriptDescription = z
  .string()
  .trim()
  .min(1, { error: 'Description must not be empty' })
  .describe('What the script does')

/** A JSON Schema object; rejected if Zod can't interpret it as one. */
export const jsonSchema = z.record(z.string(), z.unknown()).refine(
  (schema) => {
    try {
      z.fromJSONSchema(schema)
      return true
    } catch {
      return false
    }
  },
  { error: 'Must be a valid JSON Schema' },
)

export const scriptInputSchema = jsonSchema.describe(
  'JSON Schema for the script input, e.g. `{ "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] }`. Input is validated against it before the script runs.',
)

export const scriptOutputSchema = jsonSchema.describe(
  'JSON Schema for the value the script returns',
)

export const scriptSource = z
  .string()
  .min(1)
  .describe(
    'Body of an async JavaScript function run in a sandbox. `input` holds the validated input, every upstream tool is `await tools.<functionName>(args)`, and the `return` value is the output, e.g. `return await tools.Gmail_ListEmails({ n_emails: input.count })`',
  )

/** Fields accepted when creating a script; updates take any subset. */
export const scriptFields = {
  name: scriptName,
  description: scriptDescription,
  inputSchema: scriptInputSchema,
  outputSchema: scriptOutputSchema,
  source: scriptSource,
}
