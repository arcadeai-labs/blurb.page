// App records and json-render spec shapes. Browser-safe, like `./catalog`.
import { VisibilityConditionSchema } from '@json-render/core'
import { z } from 'zod'

const record = z.record(z.string(), z.unknown())

/** Lowercase words joined by single hyphens, e.g. `issue-tracker`. */
export const appName = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: 'Name must be a slug: lowercase letters, digits and single hyphens',
  })
  .max(64)
  .describe('Slug-friendly name, used in the app URL, e.g. `issue-tracker`')

const nextAction = z.object({ action: z.string(), params: record.optional() })

const setState = z.object({ set: record })

export const actionBindingSchema = z
  .object({
    action: z
      .string()
      .describe(
        'runScript, toast, setState, pushState, removeState or validateForm',
      ),
    params: record.optional(),
    confirm: z
      .object({
        title: z.string(),
        message: z.string(),
        confirmLabel: z.string().optional(),
        cancelLabel: z.string().optional(),
        variant: z.enum(['default', 'danger']).optional(),
      })
      .optional()
      .describe('Ask for confirmation first'),
    onSuccess: z
      .union([z.object({ navigate: z.string() }), setState, nextAction])
      .optional()
      .describe(
        'Runs after success: another { "action", "params" }, { "set": { "/path": value } }, or { "navigate": "/apps/<name>" }',
      ),
    onError: z
      .union([setState, nextAction])
      .optional()
      .describe(
        'Runs on failure instead of stopping: { "action", "params" } or { "set": { "/path": "$error.message" } }',
      ),
    preventDefault: z.boolean().optional(),
  })
  .describe('Runs an action, e.g. { "action": "runScript", "params": { … } }')

export type ActionBinding = z.infer<typeof actionBindingSchema>

/** One action or a list run in order; a failing action stops the list. */
const actionBindings = z.union([
  actionBindingSchema,
  z.array(actionBindingSchema),
])

export const elementSchema = z.strictObject({
  type: z.string().describe('Component name from the catalog'),
  props: record.describe('Component props; values may be expressions'),
  children: z.array(z.string()).describe('Keys of child elements'),
  slots: z.record(z.string(), z.array(z.string())).optional(),
  visible: VisibilityConditionSchema.optional().describe(
    'Visibility condition',
  ),
  repeat: z
    .object({
      statePath: z.union([z.string(), z.object({ $item: z.string() })]),
      key: z.string().optional(),
    })
    .optional()
    .describe('Render children once per item of a state array'),
  on: z
    .record(z.string(), actionBindings)
    .optional()
    .describe('Event name → action binding(s)'),
  watch: z
    .record(z.string(), actionBindings)
    .optional()
    .describe('State path → action binding(s), fired when the value changes'),
})

export type AppElement = z.infer<typeof elementSchema>

export const specSchema = z
  .object({
    root: z.string().describe('Key of the root element'),
    elements: z
      .record(z.string(), elementSchema)
      .describe('Flat map of element key → element'),
    state: record
      .optional()
      .describe('Initial state model, read and written with JSON Pointers'),
  })
  .describe('A json-render spec (flat element map). See get_app_guide.')

export type AppSpec = z.infer<typeof specSchema>

export const onLoadSchema = z
  .array(actionBindingSchema)
  .describe(
    'Actions run in order when the app opens, typically runScript calls that load data into state',
  )

/** Fields accepted when creating an app; updates take any subset. */
export const appFields = {
  name: appName,
  title: z.string().trim().min(1).describe('Shown as the page heading'),
  description: z.string().describe('What the app is for'),
  spec: specSchema,
  onLoad: onLoadSchema.optional(),
}

export const appSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  updatedAt: z.iso.datetime(),
})

export type AppSummary = z.infer<typeof appSummarySchema>

export const appSchema = appSummarySchema.extend({
  spec: specSchema,
  onLoad: onLoadSchema,
  createdAt: z.iso.datetime(),
})

export type App = z.infer<typeof appSchema>
