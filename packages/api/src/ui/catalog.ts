// The json-render catalog apps are written against. Browser-safe: the frontend
// imports it (through `@template/api/ui`) to render apps, and the MCP server
// uses it to validate specs and describe them to agents.
import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog'
import { z } from 'zod'

const record = z.record(z.string(), z.unknown())

/** Components added on top of the shadcn set, for data-backed apps. */
export const customComponentDefinitions = {
  Chart: {
    props: z.object({
      type: z.enum(['bar', 'line', 'area', 'pie']),
      data: z.array(record),
      xKey: z.string(),
      series: z.array(
        z.object({
          key: z.string(),
          label: z.string().nullish(),
        }),
      ),
      title: z.string().nullable(),
      description: z.string().nullable(),
      height: z.number().nullable(),
      stacked: z.boolean().nullable(),
    }),
    slots: [],
    description:
      'Chart of an array of objects, usually { "$state": "/path" } holding a script result. xKey is the field on the x-axis (the slice label for pie). Each series plots one numeric field; pie uses the first series. stacked applies to bar/area. Height in px (default 300).',
    example: {
      type: 'bar',
      data: { $state: '/sales' },
      xKey: 'month',
      series: [{ key: 'revenue', label: 'Revenue' }],
      title: 'Revenue by month',
    },
  },
  Metric: {
    props: z.object({
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      description: z.string().nullable(),
      change: z.string().nullable(),
      trend: z.enum(['up', 'down', 'neutral']).nullable(),
    }),
    slots: [],
    description:
      'KPI card: a label over a large value, with optional change text (e.g. "+12%") and trend arrow. Put several in a Grid.',
    example: {
      label: 'Open issues',
      value: { $state: '/stats/openIssues' },
      change: '+3 this week',
      trend: 'up',
    },
  },
  DataTable: {
    props: z.object({
      data: z.array(record),
      columns: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          format: z
            .enum([
              'text',
              'number',
              'currency',
              'percent',
              'date',
              'datetime',
              'boolean',
              'json',
            ])
            .nullish(),
        }),
      ),
      rowKey: z.string().nullable(),
      selected: record.nullable(),
      emptyMessage: z.string().nullable(),
      caption: z.string().nullable(),
    }),
    slots: [],
    events: ['select'],
    description:
      'Table of an array of objects, usually { "$state": "/path" } holding a script result. Column keys may be dot paths ("author.name"); currency formats as USD and percent expects a fraction (0.12 → 12%). Bind selected with { "$bindState": "/selected" } to make rows clickable: a click writes that row object to state and fires on.select (master/detail, or edit/delete the selected row). rowKey (default "id") identifies the selected row. For per-row buttons use RowTable instead.',
    example: {
      data: { $state: '/issues' },
      columns: [
        { key: 'title', label: 'Title' },
        { key: 'createdAt', label: 'Created', format: 'date' },
      ],
      selected: { $bindState: '/selectedIssue' },
    },
  },
  RowTable: {
    props: z.object({
      columns: z.array(z.string()),
      caption: z.string().nullable(),
    }),
    slots: ['default'],
    description:
      'Table whose rows are elements, for rows with buttons, badges or inputs. Put "repeat": { "statePath": "/items", "key": "id" } on the RowTable and a single RowTableRow child; the row is rendered once per item. columns are the header labels. For an empty state, add a sibling Text with visible: { "$state": "/items/0", "not": true }.',
    example: { columns: ['Name', 'Status', ''] },
  },
  RowTableRow: {
    props: z.object({}),
    slots: ['default'],
    description:
      'One RowTable row. Each child element becomes one cell, in column order. Inside, read the current item with { "$item": "field" } and pass it to actions, e.g. a Button whose on.press runs runScript with input { "id": { "$item": "id" } }.',
    example: {},
  },
  JsonView: {
    props: z.object({
      value: z.unknown(),
      title: z.string().nullable(),
    }),
    slots: [],
    description:
      'Pretty-printed JSON of any value. Handy for showing a raw script result while building an app.',
    example: { value: { $state: '/result' } },
  },
}

/** Every component an app can use: the shadcn set plus the custom ones. */
export const appComponentDefinitions = {
  ...shadcnComponentDefinitions,
  // The frontend stretches vertical stacks by default, so pages lay out full width.
  Stack: {
    ...shadcnComponentDefinitions.Stack,
    description:
      'Flex container for layouts. align defaults to "stretch" (full-width children) when vertical and "start" when horizontal.',
  },
  ...customComponentDefinitions,
}

const statePath = z.string().nullable()

export const runScriptParams = z.object({
  script: z.string(),
  input: record.nullable(),
  statePath,
  loadingPath: statePath,
  errorPath: statePath,
  validate: z.boolean().nullable(),
})

export const toastParams = z.object({
  message: z.string(),
  description: z.string().nullable(),
  type: z.enum(['success', 'error', 'info']).nullable(),
})

/** Actions apps can bind on top of json-render's built-in state actions. */
export const appActionDefinitions = {
  runScript: {
    params: runScriptParams,
    description:
      'Run a saved script on the server and store its return value in state. Params: { script: string (script name), input?: object (validated against the script inputSchema; values may be expressions such as { "$state": "/form" } or { "$item": "id" }), statePath?: string (where to write the return value), loadingPath?: string (true while running, then false), errorPath?: string (error message on failure, null on success; without it failures show a toast), validate?: boolean (validate every form field first and stop if any is invalid) }. A failure stops the rest of an action list.',
  },
  toast: {
    params: toastParams,
    description:
      'Show a toast notification. Params: { message: string, description?: string, type?: "success" | "error" | "info" }.',
  },
}

export const appCatalog = defineCatalog(schema, {
  components: appComponentDefinitions,
  actions: appActionDefinitions,
})

/** Actions json-render handles itself, available without being declared. */
export const builtInActionNames = (schema.builtInActions ?? []).map(
  (action) => action.name,
)
