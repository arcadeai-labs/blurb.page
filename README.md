# TanStack Start + Hono Turborepo

This template is a PNPM/Turbo monorepo:

- `packages/api`: the Hono (OpenAPI) app — the single source of truth for the API
- `packages/cli`: the `template` CLI — dev servers and typed API access
- `apps/frontend`: TanStack Start React app on a Cloudflare Worker that renders apps
- `apps/server`: Node server (`@hono/node-server`) that serves `packages/api`

The API is Node-only: script execution uses the [`run`](https://www.run-sdk.dev)
sandbox, which needs `node:worker_threads`. The frontend stays a Worker.

`pnpm dev` runs `pnpm cli dev`, which starts both apps through portless with
HTTPS enabled:

- `https://frontend.localhost` — the app; Vite proxies `/api` to the API server
- `https://server.localhost/api` — Swagger UI for the Hono app

On non-`main` branches the branch slug is prepended to the hostname, for example
`https://my-branch.frontend.localhost`.

The frontend is a thin renderer: it talks to the API's MCP server (`/mcp`), the
same interface agents use, to load apps and run their scripts. In dev it calls
the API on the current origin through the Vite proxy (`/api` and `/mcp`); set
`VITE_API_BASE_URL` to point a deployed frontend at the deployed API.

```sh
pnpm dev:server     # just the API, at https://server.localhost
pnpm start          # the API without watch mode
```

## Scripts

`/api/scripts` is CRUD for saved scripts, and `POST /api/scripts/:id/execute`
runs one in the `run` QuickJS sandbox. Every tool on the MCP server at
`MCP_URL` is exposed to scripts as `tools.<functionName>(args)`. Names are made
into valid identifiers, so `Gmail.ListEmails` becomes `tools.Gmail_ListEmails`.
`GET /api/tools` lists them.

```js
const emails = await tools.Gmail_ListEmails({ n_emails: input.count })
return emails
```

Each script declares an `inputSchema` and `outputSchema` (JSON Schema). The
input passed to `execute` is validated against `inputSchema` and is available to
the script as `input`. Script names are unique slugs; apps run scripts by name.

Tool results come back as structured content, or as parsed JSON text, or as plain
text. Script failures, including tool errors, return
`{ ok: false, error: { code, message } }`. The server sends
`Authorization: Bearer $ARCADE_API_KEY` and `Arcade-User-ID: $ARCADE_USER_ID`
to the MCP server when those are set. `apps/server` reads the repo-root
`.env.local` and `.env`.

## Apps

An app is a [json-render](https://json-render.dev) spec — a flat JSON tree of
shadcn/ui components with state, visibility conditions and event bindings —
served by the frontend at `/apps/<name>`. Its buttons, forms, watchers and
`onLoad` hooks call scripts with the `runScript` action and render the results
in tables, charts, metrics and forms.

Apps are created and changed over MCP. An agent needs only the MCP URL
(`http://127.0.0.1:8787/mcp`, or `/mcp` on the frontend origin): the server's
instructions explain the workflow, and `get_app_guide` documents the spec
format, every component and action, and common patterns with a full example.
`create_app` / `update_app` validate specs (components, props, actions, script
names and the element tree) and return readable errors.

The catalog lives in `packages/api/src/ui` and is shared with the frontend as
`@template/api/ui`.

## CLI

`packages/cli` is exposed at the repo root as `pnpm cli`:

```sh
pnpm cli dev                 # API + frontend on portless, opens the browser when ready
pnpm cli dev --no-open       # …without opening the browser
pnpm cli dev server          # just apps/server
pnpm cli api stats           # GET /api/stats
pnpm cli api stats --json    # raw JSON
pnpm cli api openapi         # GET /api/openapi.json
pnpm cli api docs --open     # Swagger UI
pnpm cli api tools           # MCP tools available to scripts
pnpm cli api scripts list
pnpm cli api scripts create --name inbox --file inbox.js
pnpm cli api scripts get|update|delete <id>
pnpm cli api scripts execute <id> --input '{"count": 5}'
```

`pnpm dev` is `pnpm cli dev`: it starts the portless HTTPS proxy, registers the
branch's alias for each app, runs each app's own `dev` script behind it, waits for the URL to
answer and opens it in a browser, then removes the alias on exit. Running an
app's `dev` script directly (`pnpm --filter @template/frontend dev`) skips
portless and serves plain HTTP on the app's port.

The `api` commands call the same Hono app through the typed RPC client, so they
stay in sync with `packages/api`. They target `--base-url`, or `$TEMPLATE_API_BASE_URL`, or the
portless server URL. Node does not read the system trust
store, so the CLI adds the portless CA (`~/.portless/ca.pem`) to its own trust
list to reach `https://*.localhost`.

The package is independently publishable: `pnpm --filter @template/cli build`
bundles it with tsdown, inlining workspace dependencies so `commander` and
`hono` are the only runtime dependencies of the published `template` binary.

## Database

Drizzle + Postgres, in `packages/api/src/db`. Everything connects through a
plain `DATABASE_URL` (`postgres.js`); routes use the shared client from `getDb()`.

- Without `DATABASE_URL`, everything falls back to a local PGlite database. Run
  `pnpm db:local` to serve it at `postgres://postgres:postgres@127.0.0.1:5433/postgres`.
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` read `DATABASE_URL`
  from the environment, then from the repo-root `.env.local` or `.env`.
- `apps/server` reads it from the same files. Migrations never run on startup.

## Commands

```sh
pnpm dev
pnpm cli
pnpm build
pnpm typecheck
pnpm lint
pnpm fmt
pnpm deploy
```

Regenerate the frontend Worker's environment types after changing its `wrangler.jsonc`:

```sh
pnpm cf-typegen
```
