# TanStack Start + Hono Turborepo

This template is a PNPM/Turbo monorepo:

- `packages/api`: the Hono (OpenAPI) app — the single source of truth for the API
- `packages/cli`: the `template` CLI — dev server and typed API access
- `apps/frontend`: TanStack Start React app that renders apps and serves the API

Everything is one Node server: `apps/frontend` serves the UI, mounts the Hono
app at `/api` (`src/routes/api/$.ts`) and its MCP server at `/mcp`
(`src/routes/mcp.ts`). It has to be Node because script execution uses the
[`run`](https://www.run-sdk.dev) sandbox, which needs `node:worker_threads`.

`pnpm dev` runs `pnpm cli dev`, which starts it through portless with HTTPS
enabled at `https://frontend.localhost` (Swagger UI at `/api`). On non-`main`
branches the branch slug is prepended to the hostname, for example
`https://my-branch.frontend.localhost`.

The frontend is a thin renderer: it talks to the MCP server (`/mcp`), the same
interface agents use, to load apps and run their scripts.

## Deploying

The server is built with [Nitro](https://nitro.build) and has no host-specific
code. `pnpm build` produces a plain Node server:

```sh
pnpm build
pnpm start          # node .output/server/index.mjs, reading the repo-root .env files
```

It listens on `PORT` (default 3000) on all interfaces, so the same output runs
in a Docker container. On Vercel, set the project's root directory to
`apps/frontend`; Nitro detects Vercel at build time and emits a Node function
instead.

Configure `DATABASE_URL`, `MCP_URL` and `BETTER_AUTH_SECRET` (for example
`openssl rand -base64 32`) in the environment, and run `pnpm db:migrate` against the database before
deploying a schema change. App URLs use the request's origin; set
`FRONTEND_URL` when that differs from the public URL (for example behind a
proxy that terminates TLS).

### Preview databases on Vercel

Preview deployments each get their own Neon branch through the
[Neon-managed Vercel integration](https://neon.com/docs/guides/neon-managed-vercel-integration).
On every preview deployment it branches the Neon project's default branch into
`preview/<git-branch>` and sets `DATABASE_URL` / `DATABASE_URL_UNPOOLED` for
that deployment. To set it up:

1. In the Neon Console, open the project → **Integrations** → **Vercel** → **Add**,
   then **Link Existing Neon Account** and pick the Vercel project, database
   and role.
2. Turn on **Automatically delete obsolete Neon branches**, so a preview branch
   is removed after its Git branch is deleted. The integration also points
   Production and Development's `DATABASE_URL` at the default branch.
3. Set `MCP_URL` and `BETTER_AUTH_SECRET` for the Preview environment in
   Vercel too. Arcade fetches each deployment's `/api/arcade/client.json` to
   sign users in, so Vercel's Deployment Protection has to let that path
   through (or be off for previews).

`apps/frontend/vercel.json` runs `pnpm db:migrate` before the build on preview
deployments only, so each branch gets the PR's migrations. Production is still
migrated by hand, and nothing migrates on startup. Don't rename a Git branch
with a preview database: the integration matches Neon branches by name.

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
`{ ok: false, error: { code, message } }`. Scripts run as the signed-in user:
the server calls the MCP server with that user's Arcade access token (see
[Auth](#auth)). The dev server and `pnpm start` read the repo-root `.env.local`
and `.env`.

## Auth

Anyone with an Arcade account signs in with it, the way MCP clients sign in to
Arcade's gateways. every-ui is a client of Arcade's OAuth server
(`https://cloud.arcade.dev/oauth2`, or `ARCADE_OAUTH_ISSUER`), and the access
token it gets back both identifies the user (its `sub` and `email`) and
authorizes their calls to `MCP_URL`. Point `MCP_URL` at an Arcade gateway that
uses Arcade auth, such as `https://api.arcade.dev/mcp/arcade`, which runs tools
in the user's own default project, with their own connections. Nothing has to
be set up on Arcade's side.

[Better Auth](https://www.better-auth.com) (`packages/api/src/auth`, mounted at
`/api/auth`) keeps users, sessions and the encrypted Arcade tokens in Postgres,
and refreshes the tokens when they expire. Everything under `/api`, except auth
itself, needs a signed-in user, and so does `/mcp`:

- The frontend calls `/mcp` with its session cookie.
- Other MCP clients (agents) use OAuth: every-ui is also an authorization
  server for its own `/mcp` (Better Auth's MCP plugin), so a client registers
  itself, sends the user to `/login` and `/consent`, and then acts as them.

Arcade identifies every-ui by a client ID per origin. On a public origin it's
the URL of a client metadata document every-ui serves
(`/api/arcade/client.json`), which Arcade fetches. Arcade can't fetch a local
one, so the dev server registers a client instead and keeps it in the
`arcade_clients` table. Arcade only redirects over http to bare loopback hosts,
so signing in on the portless `https://*.localhost` URL goes back through
`http://127.0.0.1:$PORT`, which forwards to the portless URL.

## Apps

An app is a [json-render](https://json-render.dev) spec — a flat JSON tree of
shadcn/ui components with state, visibility conditions and event bindings —
served by the frontend at `/apps/<name>`. Specs declare named queries (scripts
that load data, refetched when their input changes) and mutations (scripts run
by buttons and forms, which refetch the queries they invalidate). Results are
rendered in tables, charts, metrics and forms; data is only read inside a
`Query` element, so loading and error states are always handled.

Apps are created and changed over MCP. An agent needs only the MCP URL
(`http://127.0.0.1:5173/mcp` in dev, or `/mcp` on the deployed origin) and
signs in when it connects: the server's
instructions explain the workflow, and `get_app_guide` documents the spec
format, every component and action, and common patterns with a full example.
`create_app` / `update_app` validate specs (components, props, actions, script
names, queries and mutations, and the element tree) and return readable errors.

The catalog lives in `packages/api/src/ui` and is shared with the frontend as
`@template/api/ui`.

## CLI

`packages/cli` is exposed at the repo root as `pnpm cli`:

```sh
pnpm cli dev                 # the app on portless, opens the browser when ready
pnpm cli dev --no-open       # …without opening the browser
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
branch's alias for the app, runs its `dev` script behind it, waits for the URL to
answer and opens it in a browser, then removes the alias on exit. It also points
the `every-ui` entry in the repo's `.mcp.json` at the MCP endpoint
(`http://127.0.0.1:5173/mcp`), so MCP clients opened in the checkout, like
Claude Code, use it. Other entries are kept, and it uses the loopback URL
because Node-based clients don't trust the portless CA. Running the `dev` script
directly (`pnpm --filter @template/frontend dev`) skips portless and serves
plain HTTP on port 5173.

The `api` commands call the same Hono app through the typed RPC client, so they
stay in sync with `packages/api`. They can't sign in yet, so everything but
`openapi` and `docs` answers 401 now that the API needs a signed-in user. They target `--base-url`, or `$TEMPLATE_API_BASE_URL`, or the
portless app URL. Node does not read the system trust
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
  from the environment, then from the repo-root `.env.local` or `.env`. They
  use `DATABASE_URL_UNPOOLED` (Neon's direct connection) when it's set.
- The server reads it from the same files. Migrations never run on startup.

## Commands

```sh
pnpm dev
pnpm cli
pnpm build
pnpm typecheck
pnpm lint
pnpm fmt
pnpm start
```
