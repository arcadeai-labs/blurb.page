import type { ActionBinding, AppSpec } from './app'
import { appCatalog } from './catalog'

/**
 * The part of json-render's generated prompt that documents components,
 * actions, expressions, visibility, validation and watchers. Its streaming
 * output-format and sample-data sections don't apply here: apps are saved as
 * one JSON object and their data comes from scripts.
 */
function catalogReference() {
  const prompt = appCatalog.prompt()
  const start = prompt.indexOf('DYNAMIC LISTS')
  const end = prompt.indexOf('\nRULES:')

  return start >= 0 && end > start ? prompt.slice(start, end).trim() : prompt
}

const loadIssues: ActionBinding = {
  action: 'runScript',
  params: {
    script: 'list-issues',
    input: { state: { $state: '/filter' } },
    statePath: '/issues',
    loadingPath: '/loading',
    errorPath: '/error',
  },
}

/** A complete, valid `create_app` call; scripts are referenced by name. */
export const exampleApp: {
  name: string
  title: string
  description: string
  spec: AppSpec
  onLoad: ActionBinding[]
} = {
  name: 'issue-tracker',
  title: 'Issue tracker',
  description: 'List, chart, open and close issues',
  onLoad: [
    loadIssues,
    {
      action: 'runScript',
      params: { script: 'issue-stats', statePath: '/stats' },
    },
  ],
  spec: {
    root: 'page',
    state: {
      filter: 'open',
      issues: [],
      stats: { open: 0, closed: 0, byLabel: [] },
      form: { title: '', body: '' },
      loading: false,
      error: null,
    },
    elements: {
      page: {
        type: 'Stack',
        props: { direction: 'vertical', gap: 'lg' },
        children: ['error', 'metrics', 'chart', 'issues-card', 'new-issue'],
      },
      error: {
        type: 'Alert',
        props: {
          type: 'error',
          title: 'Could not load issues',
          message: { $state: '/error' },
        },
        visible: { $state: '/error' },
        children: [],
      },
      metrics: {
        type: 'Grid',
        props: { columns: 2, gap: 'md' },
        children: ['metric-open', 'metric-closed'],
      },
      'metric-open': {
        type: 'Metric',
        props: { label: 'Open', value: { $state: '/stats/open' } },
        children: [],
      },
      'metric-closed': {
        type: 'Metric',
        props: { label: 'Closed', value: { $state: '/stats/closed' } },
        children: [],
      },
      chart: {
        type: 'Chart',
        props: {
          type: 'bar',
          title: 'Issues by label',
          data: { $state: '/stats/byLabel' },
          xKey: 'label',
          series: [
            { key: 'open', label: 'Open' },
            { key: 'closed', label: 'Closed' },
          ],
          stacked: true,
        },
        children: [],
      },
      'issues-card': {
        type: 'Card',
        props: { title: 'Issues' },
        children: ['filter', 'loading', 'issues', 'no-issues'],
      },
      filter: {
        type: 'Select',
        props: {
          label: 'State',
          name: 'state',
          options: ['open', 'closed'],
          value: { $bindState: '/filter' },
        },
        watch: { '/filter': loadIssues },
        children: [],
      },
      loading: {
        type: 'Spinner',
        props: { label: 'Loading issues' },
        visible: { $state: '/loading' },
        children: [],
      },
      issues: {
        type: 'RowTable',
        props: { columns: ['Title', 'Labels', ''] },
        repeat: { statePath: '/issues', key: 'id' },
        visible: { $state: '/loading', not: true },
        children: ['issue-row'],
      },
      'no-issues': {
        type: 'Text',
        props: { text: 'No issues', variant: 'muted' },
        visible: [
          { $state: '/loading', not: true },
          { $state: '/issues/0', not: true },
        ],
        children: [],
      },
      'issue-row': {
        type: 'RowTableRow',
        props: {},
        children: ['issue-title', 'issue-labels', 'issue-close'],
      },
      'issue-title': {
        type: 'Text',
        props: { text: { $item: 'title' } },
        children: [],
      },
      'issue-labels': {
        type: 'Badge',
        props: { text: { $item: 'labelText' }, variant: 'secondary' },
        children: [],
      },
      'issue-close': {
        type: 'Button',
        props: { label: 'Close', variant: 'secondary' },
        visible: { $item: 'state', eq: 'open' },
        on: {
          press: [
            {
              action: 'runScript',
              params: { script: 'close-issue', input: { id: { $item: 'id' } } },
              confirm: {
                title: 'Close issue?',
                message: 'It can be reopened later.',
              },
            },
            loadIssues,
            { action: 'toast', params: { message: 'Issue closed' } },
          ],
        },
        children: [],
      },
      'new-issue': {
        type: 'Card',
        props: { title: 'New issue' },
        children: ['new-title', 'new-body', 'create'],
      },
      'new-title': {
        type: 'Input',
        props: {
          label: 'Title',
          name: 'title',
          value: { $bindState: '/form/title' },
          checks: [{ type: 'required', message: 'Title is required' }],
        },
        children: [],
      },
      'new-body': {
        type: 'Textarea',
        props: {
          label: 'Description',
          name: 'body',
          value: { $bindState: '/form/body' },
        },
        children: [],
      },
      create: {
        type: 'Button',
        props: { label: 'Create issue' },
        on: {
          press: [
            {
              action: 'runScript',
              params: {
                script: 'create-issue',
                input: { $state: '/form' },
                validate: true,
              },
            },
            {
              action: 'setState',
              params: { statePath: '/form', value: { title: '', body: '' } },
            },
            loadIssues,
            {
              action: 'toast',
              params: { message: 'Issue created', type: 'success' },
            },
          ],
        },
        children: [],
      },
    },
  },
}

/** Scripts the example app runs. */
export const exampleScriptNames = new Set([
  'list-issues',
  'issue-stats',
  'close-issue',
  'create-issue',
])

const exampleScript = {
  name: 'list-issues',
  description: 'List repository issues in a given state, flattened for tables',
  inputSchema: {
    type: 'object',
    properties: { state: { type: 'string', enum: ['open', 'closed'] } },
    required: ['state'],
  },
  outputSchema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' },
        state: { type: 'string' },
        labelText: { type: 'string' },
      },
    },
  },
  source: `const { issues } = await tools.Github_ListIssues({ owner: 'acme', repo: 'web', state: input.state })
return issues.map((issue) => ({
  id: issue.number,
  title: issue.title,
  state: issue.state,
  labelText: issue.labels.map((label) => label.name).join(', ') || 'none',
}))`,
}

/** Everything an agent needs to build apps, returned by `get_app_guide`. */
export function appGuide(frontendUrl: string) {
  return `# Building apps

An app is a web UI described as JSON (a json-render spec) and rendered with shadcn/ui components at ${frontendUrl}/apps/<name>. Apps read and change real data by running scripts: server-side JavaScript that calls integration tools. The browser runs scripts through this MCP server (execute_script), so anything an app does, you can do and test yourself with the same tools.

## Workflow

1. list_script_tools — the integration tools scripts can call (and their input schemas).
2. create_script — one script per data operation the app needs (list, get, create, update, delete, aggregate for a chart…). Test each with execute_script before wiring it into a UI.
3. create_app — the spec, plus onLoad actions that fill state when the app opens. The response has the app URL. It is rejected with a list of errors if anything is invalid; fix them and retry.
4. Iterate with get_app / update_app (send the whole spec) / delete_app, and list_apps / list_scripts to see what exists.

## Scripts

A script's source is the body of an async JavaScript function, run in a sandbox (QuickJS; 60s timeout; no network, filesystem or npm — only the host functions below).

- \`input\` is a global holding the call's input, validated against the script's inputSchema first.
- Every integration tool is \`await tools.<functionName>(args)\` (functionName from list_script_tools). Tool results come back as structured JSON when available, otherwise parsed JSON text, otherwise a string. A tool error throws.
- \`return\` the output. It must be JSON-serializable; outputSchema documents its shape.
- Shape the output for the UI: flat arrays of objects with an \`id\` for tables and lists, pre-aggregated arrays for charts (e.g. [{ "month": "Jan", "revenue": 10 }]), plain objects for metrics. Do formatting and joins in the script, not the spec.
- Scripts are referenced by name from apps, so names are unique slugs.

Example create_script call:

\`\`\`json
${JSON.stringify(exampleScript, null, 2)}
\`\`\`

## App specs

An app is \`{ name, title, description, spec, onLoad }\`. The spec is a single JSON object (not a stream of patches):

\`\`\`json
{
  "root": "page",
  "elements": {
    "page": { "type": "Stack", "props": { "direction": "vertical", "gap": "lg" }, "children": ["title"] },
    "title": { "type": "Heading", "props": { "text": "Hello" }, "children": [] }
  },
  "state": { }
}
\`\`\`

- elements is a flat map of key → { type, props, children, visible?, repeat?, on?, watch?, slots? }. Every element needs a children array ([] for leaves) and every child key must exist.
- type must be a component listed below and props must match its props. Optional props can be omitted.
- state is the initial state model. Seed every path the UI reads (empty arrays for lists, "" for inputs, false for flags). Do not invent sample data: real data comes from scripts.
- The page already shows the app title and description as a heading, so start the spec with content.

## Running scripts from an app

Bind the runScript action to events (on), state changes (watch) or app load (onLoad):

\`\`\`json
{ "action": "runScript", "params": { "script": "list-issues", "input": { "state": { "$state": "/filter" } }, "statePath": "/issues", "loadingPath": "/loading", "errorPath": "/error" } }
\`\`\`

- input values can be expressions: { "$state": "/form" } sends a whole form object, { "$item": "id" } sends a field of the current repeat item.
- The return value is written to statePath; display it with { "$state": "/issues" }, repeat over it, or feed it to Chart, DataTable or Metric.
- on.<event>, watch.<path> and onSuccess accept a list of actions, run in order. A failing (or cancelled) action stops the list, so [runScript create, runScript reload, toast] only reloads and toasts after a successful create.
- Add "confirm": { "title", "message" } to any action binding to ask first (use it for deletes).
- Without errorPath a failure shows an error toast. With it, the message is written to state so you can show an Alert with visible: { "$state": "/error" }.

## Patterns

- Empty states: a Text with visible: [{ "$state": "/loading", "not": true }, { "$state": "/items/0", "not": true }].
- Load on open: onLoad runs its actions in order when the app opens. Show a Spinner or Skeleton with visible: { "$state": "/loading" } using loadingPath.
- Forms: bind inputs with { "$bindState": "/form/<field>" }, add checks for validation, and submit with a Button whose on.press is [runScript with "validate": true and "input": { "$state": "/form" }, setState to reset /form, runScript to reload, toast].
- Row actions: RowTable with repeat over the array and a RowTableRow child; buttons in the row pass { "$item": "id" } to runScript.
- Master/detail: DataTable with "selected": { "$bindState": "/selected" } and a watch on "/selected" that runs a get script with input { "id": { "$state": "/selected/id" } }; show details with visible: { "$state": "/selected" }.
- Filters and search: bind a Select/Input to /filter and either watch "/filter" or press a Search button to rerun the list script with the filter as input.
- Edit dialogs: DataTable with "selected": { "$bindState": "/selected" } and on.select running setState { "statePath": "/editing", "value": true }; a Dialog with openPath "/editing" holds inputs bound to /selected/<field>; Save runs the update script with "input": { "$state": "/selected" }, then setState /editing false and reloads.
- Note: a top-level { "$item": "field" } action param resolves to the item's state path, not its value; nest it (e.g. "input": { "id": { "$item": "id" } }) to pass the value.
- Pages: Tabs with value { "$bindState": "/tab" } and sections with visible conditions, or Link to another app at "/apps/<name>".
- Disable a button while a script runs: "disabled": { "$state": "/saving" } with "loadingPath": "/saving".

## Complete example

A create_app call for an issue tracker. It assumes scripts named list-issues (input { state }, returns [{ id, title, state, labelText }]), issue-stats (returns { open, closed, byLabel: [{ label, open, closed }] }), create-issue (input { title, body }) and close-issue (input { id }).

\`\`\`json
${JSON.stringify(exampleApp, null, 2)}
\`\`\`

## Component and expression reference

Expressions such as { "$state": "/path" } work in any prop and in action params. Paths are JSON Pointers ("/form/title", "/issues/0/id").

${catalogReference()}
`
}
