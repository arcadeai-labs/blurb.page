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
export const jsonSchema = z
  .record(z.string(), z.unknown())
  .refine(
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
  'JSON Schema for the script input',
)

export const scriptOutputSchema = jsonSchema.describe(
  'JSON Schema for the value the script returns',
)

export const scriptSource = z
  .string()
  .min(1)
  .describe(
    'JavaScript run in the sandbox, e.g. `return await tools.Gmail_ListEmails({ n_emails: 5 })`',
  )

/** Fields accepted when creating a script; updates take any subset. */
export const scriptFields = {
  name: scriptName,
  description: scriptDescription,
  inputSchema: scriptInputSchema,
  outputSchema: scriptOutputSchema,
  source: scriptSource,
}
