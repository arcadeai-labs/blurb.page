import type { AppSpec } from './app'
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

/** A complete, valid `create_app` call; scripts are referenced by name. */
export const exampleApp: {
  name: string
  title: string
  description: string
  spec: AppSpec
} = {
  name: 'issue-tracker',
  title: 'Issue tracker',
  description: 'List, chart, open and close issues',
  spec: {
    root: 'page',
    state: {
      filter: 'open',
      form: { title: '', body: '' },
    },
    queries: {
      issues: {
        script: 'list-issues',
        input: { state: { $state: '/filter' } },
      },
      stats: { script: 'issue-stats' },
    },
    mutations: {
      createIssue: {
        script: 'create-issue',
        input: { $state: '/form' },
        invalidates: ['issues', 'stats'],
      },
      closeIssue: { script: 'close-issue', invalidates: ['issues', 'stats'] },
    },
    elements: {
      page: {
        type: 'Stack',
        props: { direction: 'vertical', gap: 'lg' },
        children: ['stats', 'issues-card', 'new-issue'],
      },
      stats: {
        type: 'Query',
        props: { query: 'stats' },
        children: ['metrics', 'chart'],
      },
      metrics: {
        type: 'Grid',
        props: { columns: 2, gap: 'md' },
        children: ['metric-open', 'metric-closed'],
      },
      'metric-open': {
        type: 'Metric',
        props: { label: 'Open', value: { $state: '/queries/stats/data/open' } },
        children: [],
      },
      'metric-closed': {
        type: 'Metric',
        props: {
          label: 'Closed',
          value: { $state: '/queries/stats/data/closed' },
        },
        children: [],
      },
      chart: {
        type: 'Chart',
        props: {
          type: 'bar',
          title: 'Issues by label',
          data: { $state: '/queries/stats/data/byLabel' },
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
        children: ['filter', 'issues'],
      },
      filter: {
        type: 'Select',
        props: {
          label: 'State',
          name: 'state',
          options: ['open', 'closed'],
          value: { $bindState: '/filter' },
        },
        children: [],
      },
      issues: {
        type: 'Query',
        props: { query: 'issues' },
        children: ['issue-scroll', 'no-issues'],
      },
      'issue-scroll': {
        type: 'ScrollArea',
        props: { height: 400 },
        children: ['issue-table'],
      },
      'issue-table': {
        type: 'RowTable',
        props: { columns: ['Title', 'Labels', ''] },
        repeat: { statePath: '/queries/issues/data', key: 'id' },
        children: ['issue-row'],
      },
      'no-issues': {
        type: 'Text',
        props: { text: 'No issues', variant: 'muted' },
        visible: { $state: '/queries/issues/data/0', not: true },
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
        props: {
          label: 'Close',
          variant: 'secondary',
          disabled: { $state: '/mutations/closeIssue/isPending' },
        },
        visible: { $item: 'state', eq: 'open' },
        on: {
          press: [
            {
              action: 'mutate',
              params: {
                mutation: 'closeIssue',
                input: { id: { $item: 'id' } },
              },
              confirm: {
                title: 'Close issue?',
                message: 'It can be reopened later.',
              },
            },
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
        props: {
          label: 'Create issue',
          disabled: { $state: '/mutations/createIssue/isPending' },
        },
        on: {
          press: [
            {
              action: 'mutate',
              params: { mutation: 'createIssue', validate: true },
            },
            {
              action: 'setState',
              params: { statePath: '/form', value: { title: '', body: '' } },
            },
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

/** A slideshow spec; its chart reads the example app's issue-stats script. */
export const exampleSlides: AppSpec = {
  root: 'deck',
  queries: { stats: { script: 'issue-stats' } },
  elements: {
    deck: {
      type: 'Slides',
      props: {},
      children: ['intro', 'status', 'labels'],
    },
    intro: {
      type: 'Slide',
      props: { title: 'Web issues review', layout: 'title' },
      children: ['intro-text'],
    },
    'intro-text': {
      type: 'Markdown',
      props: { text: 'Weekly triage · Platform team' },
      children: [],
    },
    status: {
      type: 'Slide',
      props: { title: 'Where we are', layout: 'content' },
      children: ['status-query'],
    },
    'status-query': {
      type: 'Query',
      props: { query: 'stats' },
      children: ['status-text'],
    },
    'status-text': {
      type: 'Markdown',
      props: {
        text: {
          $template:
            // biome-ignore lint/suspicious/noTemplateCurlyInString: json-render $template syntax
            '- **${/queries/stats/data/open}** open issues\n- **${/queries/stats/data/closed}** closed this quarter',
        },
      },
      children: [],
    },
    labels: {
      type: 'Slide',
      props: { title: 'By label', layout: 'two-column' },
      children: ['labels-text', 'labels-query'],
    },
    'labels-text': {
      type: 'Markdown',
      props: {
        text: '- Bugs are most of the backlog\n- Docs issues close fastest',
      },
      children: [],
    },
    'labels-query': {
      type: 'Query',
      props: { query: 'stats' },
      children: ['labels-chart'],
    },
    'labels-chart': {
      type: 'Chart',
      props: {
        type: 'bar',
        data: { $state: '/queries/stats/data/byLabel' },
        xKey: 'label',
        series: [{ key: 'open', label: 'Open' }],
      },
      children: [],
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

## Less is more

Build exactly what the user asked for, with the fewest elements that do it well. A small app that does one thing clearly beats a big one that does everything.

- No page heading, intro or tagline: the navbar already shows the app's title and description, so the spec starts with the content itself.
- No filler: no welcome text, instructions that restate the UI, descriptions that repeat a label, decorative Separators or placeholder sections.
- No features nobody asked for: no extra metrics, charts, filters, tabs or forms "for completeness". Asked for a list? Show a table. Add more when the user asks.
- Short labels (a word or two) for titles, columns, buttons and fields. Leave optional props like description, caption and placeholder out unless they say something new.
- Flat layouts: one Stack of sections. Wrap a section in a Card only when the page has several; skip Tabs, Accordions and Dialogs unless the content needs them.

## Fit the window

An app should fit in the browser window like a desktop app: the page itself shouldn't scroll, its long parts should. Anything that grows with data (tables, lists, repeated items, message or document bodies, logs, JsonView) goes in a ScrollArea, which scrolls on its own instead of stretching the page. Slideshows are the exception: slides never scroll (see Slideshows).

- Wrap only the long part, inside its Card and Query: keep a Card's title, toolbar and buttons outside the ScrollArea so they stay put.
- Side-by-side panes (list and detail, inbox and message): a Grid of panes, each with a ScrollArea without a height. Both fill the window down to the bottom and scroll independently.
- A ScrollArea without a height must be the last thing in its pane: put actions and forms (e.g. a reply box) above it, or give it a height.
- Elsewhere (a table under a form, a list in a Dialog, a long Card among others) give the ScrollArea a height in px, around 300–500.
- Keep what sits above the panes short (a toolbar, a row of Metrics) so they get most of the window.

## Workflow

1. list_script_tools — the integration tools scripts can call (and their input schemas).
2. create_script — one script per data operation the app needs (list, get, create, update, delete, aggregate for a chart…). Test each with execute_script before wiring it into a UI.
3. create_app — the spec: its elements, plus the queries that load data and the mutations that change it. The response has the app URL. It is rejected with a list of errors if anything is invalid; fix them and retry.
4. Iterate with get_app / update_app (send the whole spec) / delete_app, and list_apps / list_scripts / list_svgs to see what exists.

Images (diagrams, illustrations, icons) are SVGs saved with create_svg and shown by name with the Svg component; see SVGs.

## Scripts

A script's source is the body of an async JavaScript function, run in a sandbox (QuickJS; 60s timeout; no network, filesystem or npm — only the host functions below).

- \`input\` is a global holding the call's input, validated against the script's inputSchema first.
- Every integration tool is \`await tools.<functionName>(args)\` (functionName from list_script_tools). Tool results come back as structured JSON when available, otherwise parsed JSON text, otherwise a string. A tool error throws.
- When the user hasn't authorized an integration yet, its tools throw and the run fails with AUTHORIZATION_REQUIRED and an authorizationUrl. Apps prompt the user to authorize and then retry, so let that error propagate: don't catch it or return a fallback value. When execute_script returns it, show the user the link and retry once they've authorized.
- \`return\` the output. It must be JSON-serializable; outputSchema documents its shape.
- Shape the output for the UI: flat arrays of objects with an \`id\` for tables and lists, pre-aggregated arrays for charts (e.g. [{ "month": "Jan", "revenue": 10 }]), plain objects for metrics. Do formatting and joins in the script, not the spec.
- Scripts are referenced by name from apps, so names are unique slugs.

Example create_script call:

\`\`\`json
${JSON.stringify(exampleScript, null, 2)}
\`\`\`

## App specs

An app is \`{ name, title, description, spec }\`. The spec is a single JSON object (not a stream of patches):

\`\`\`json
{
  "root": "page",
  "elements": {
    "page": { "type": "Stack", "props": { "direction": "vertical", "gap": "lg" }, "children": ["greeting"] },
    "greeting": { "type": "Text", "props": { "text": "Hello" }, "children": [] }
  },
  "state": { },
  "queries": { },
  "mutations": { }
}
\`\`\`

- elements is a flat map of key → { type, props, children, visible?, repeat?, on?, watch?, slots? }. Every element needs a children array ([] for leaves) and every child key must exist.
- type must be a component listed below and props must match its props. Optional props can be omitted.
- state is the initial state model for what the user edits: form fields, filters, selections, tabs. Seed every path the UI binds ("" for inputs, false for flags). Do not put script results or sample data in it: data comes from queries.
- The navbar shows the app title and description, so don't repeat them in the spec: start with content.

## Queries and mutations

Apps run scripts through named queries (data the app reads) and mutations (changes it makes), declared in the spec:

\`\`\`json
{
  "queries": {
    "issues": { "script": "list-issues", "input": { "state": { "$state": "/filter" } } }
  },
  "mutations": {
    "createIssue": { "script": "create-issue", "input": { "$state": "/form" }, "invalidates": ["issues"] }
  }
}
\`\`\`

Queries:
- Run when the app opens, and again whenever a { "$state": "/path" } in their input changes. There is no need to reload them by hand.
- Their state is at /queries/<name>: { status: "pending" | "success" | "error" | "idle", data, error, isFetching }.
- Read the result with { "$state": "/queries/<name>/data" } (or a path inside it), repeat over it, or pass it to DataTable, Chart or Metric.
- Anything that reads /queries/<name>/data must be inside a Query element for that query: { "type": "Query", "props": { "query": "<name>" }, "children": [...] }. It shows a skeleton while loading, an error with a retry button on failure (with an Authorize button when an integration needs authorization), and renders its children once data is in. Put a Query around each section that needs the data.
- "enabled": a condition (same syntax as visible) that must hold for the query to run, e.g. { "$state": "/selected" } for a detail query. While disabled the status is "idle" and the Query element renders nothing.
- "refetchInterval": poll every this many milliseconds (at least 1000).
- Inputs can only use { "$state": "/path" } expressions, including other queries' data for dependent queries.

Mutations:
- Run with the mutate action: { "action": "mutate", "params": { "mutation": "createIssue" } }.
- "input" in the mutation is resolved when it runs; "input" in the mutate params is merged over it. Pass row values from the action: { "action": "mutate", "params": { "mutation": "closeIssue", "input": { "id": { "$item": "id" } } } }.
- "invalidates" lists the queries to refetch after it succeeds.
- Their state is at /mutations/<name>: { status: "idle" | "pending" | "success" | "error", data, error, isPending }. Disable a button while it runs with "disabled": { "$state": "/mutations/<name>/isPending" }.
- A failure shows an error toast and stops the rest of the action list, so [mutate, setState reset, toast] only resets and toasts after a success.
- "validate": true in the mutate params validates every form field first and stops if any is invalid.

/queries and /mutations are read-only: don't bind inputs to them or setState into them, and don't declare them in state.

## Actions

- on.<event> and watch.<path> accept one action or a list, run in order. A failing (or cancelled) action stops the list.
- Add "confirm": { "title", "message" } to any action binding to ask first (use it for deletes).
- Built-in actions (setState, pushState, removeState, validateForm) change local state; toast shows a notification.

## Patterns

- Empty states: inside the Query, a Text with visible: { "$state": "/queries/items/data/0", "not": true }.
- Forms: bind inputs with { "$bindState": "/form/<field>" }, add checks for validation, and submit with a Button whose on.press is [mutate with "validate": true, setState to reset /form, toast]. The mutation's input is { "$state": "/form" } and it invalidates the list query.
- Row actions: RowTable with "repeat": { "statePath": "/queries/items/data", "key": "id" } and a RowTableRow child; buttons in the row run mutate with "input": { "id": { "$item": "id" } }.
- Master/detail: DataTable with "selected": { "$bindState": "/selected" }, and a detail query with "input": { "id": { "$state": "/selected/id" } } and "enabled": { "$state": "/selected" }, shown in its own Query element. Lay them out as side-by-side panes, each with its long content in a ScrollArea without a height (see Fit the window).
- Filters and search: bind a Select/Input to /filter and use { "$state": "/filter" } in the query input; the query refetches when it changes.
- Edit dialogs: DataTable with "selected": { "$bindState": "/selected" } and on.select running setState { "statePath": "/editing", "value": true }; a Dialog with openPath "/editing" holds inputs bound to /selected/<field> (edits change /selected, not the query data); Save runs mutate with "input": { "$state": "/selected" }, then setState /editing false.
- Note: a top-level { "$item": "field" } action param resolves to the item's state path, not its value; nest it (e.g. "input": { "id": { "$item": "id" } }) to pass the value.
- Pages: Tabs with value { "$bindState": "/tab" } and sections with visible conditions, or Link to another app at "/apps/<name>".

## SVGs

Diagrams, illustrations, icons and logos are SVGs, saved on their own with create_svg (and list_svgs / get_svg / update_svg / delete_svg) and shown in any app by name:

\`\`\`json
{ "type": "Svg", "props": { "name": "runtime-diagram", "alt": "Agents call tools through Arcade" }, "children": [] }
\`\`\`

- The markup is one standalone \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H">\` element. Give it a viewBox (not just width and height) so it scales to fit; it fills the width of its container, or set the Svg's height in px.
- It is drawn like an image: scripts, event handlers, links and external images or fonts do nothing. Text uses system fonts, so set font-family="sans-serif".
- Use theme colors so it matches the app: currentColor (the text color) and var(--foreground), var(--muted-foreground), var(--background), var(--muted), var(--line), var(--primary), var(--primary-foreground) and var(--chart-1) … var(--chart-5).
- An updated SVG shows up in every app that uses it, so fix a diagram with update_svg rather than saving a copy.
- Charts of data are a Chart, not an SVG.

## Slideshows

A presentation is an app whose root is a Slides element with one Slide child per slide. Slides shows one at a time with previous/next buttons, arrow keys and a full-screen button, so the spec needs no navigation of its own.

- Write text with Markdown: a few short bullets per slide, not paragraphs. Each Slide has a title and a layout ("title", "section", "content" or "two-column").
- Show ideas with visuals: an Svg diagram beside the bullets in a "two-column" slide, or an illustration under the title of a "title" or "section" slide (give it a height there, e.g. 160).
- Slides can show live data: wrap a Chart, Metric or DataTable in a Query, or put values in Markdown with $template, exactly as in any other app.
- One slide per row of data: "repeat" on the Slides element with a single Slide child that reads { "$item": "field" }.
- Slides never scroll, like slides in a presentation: the deck fits the window, and a slide whose content doesn't fit is shrunk until it does. No ScrollArea in a deck; split long content (a long list, a table with many rows) across slides, e.g. a few rows per slide.

\`\`\`json
${JSON.stringify(exampleSlides, null, 2)}
\`\`\`

## Complete example

A create_app call for an issue tracker. It shows many features at once for reference; a real app should only have the parts the user asked for. It assumes scripts named list-issues (input { state }, returns [{ id, title, state, labelText }]), issue-stats (returns { open, closed, byLabel: [{ label, open, closed }] }), create-issue (input { title, body }) and close-issue (input { id }).

\`\`\`json
${JSON.stringify(exampleApp, null, 2)}
\`\`\`

## Component and expression reference

Expressions such as { "$state": "/path" } work in any prop and in action params. Paths are JSON Pointers ("/form/title", "/issues/0/id").

${catalogReference()}
`
}
