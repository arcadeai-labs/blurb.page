# TanStack Start + Hono Turborepo

This template is a PNPM/Turbo monorepo:

- `packages/api`: the Hono (OpenAPI) app — the single source of truth for the API
- `packages/cli`: the `template` CLI — dev servers and typed API access
- `apps/frontend`: TanStack Start React app that mounts `packages/api` at `/api`
- `apps/server`: optional standalone Worker that serves the same API on its own

`pnpm dev` runs `pnpm cli dev`, which starts only the frontend — it serves both
the app and the API from one Worker through portless with HTTPS enabled:

- `https://frontend.localhost` — the app
- `https://frontend.localhost/api` — Swagger UI for the same Hono app
- `https://frontend.localhost/api/stats` — the one query endpoint the frontend
  reads with Hono RPC and React Query

On non-`main` branches the branch slug is prepended to the hostname, for example
`https://my-branch.frontend.localhost`.

The frontend uses TanStack server functions for app-owned reads and mutations,
and the Hono RPC client for the API. Because the API is mounted on the same
Worker, the client calls it on the current origin; set `VITE_API_BASE_URL` to
point it at a separately deployed API instead.

`apps/server` exists for running or deploying the API on its own. It imports the
same `packages/api` app, so it needs no routes of its own:

```sh
pnpm dev:server     # https://server.localhost
pnpm deploy:server
```

## CLI

`packages/cli` is exposed at the repo root as `pnpm cli`:

```sh
pnpm cli dev                 # frontend on portless, opens the browser when ready
pnpm cli dev --no-open       # …without opening the browser
pnpm cli dev server          # apps/server instead
pnpm cli api stats           # GET /api/stats
pnpm cli api stats --json    # raw JSON
pnpm cli api openapi         # GET /api/openapi.json
pnpm cli api docs --open     # Swagger UI
```

`pnpm dev` is `pnpm cli dev`: it starts the portless HTTPS proxy, registers the
branch's alias, runs the app's own `dev` script behind it, waits for the URL to
answer and opens it in a browser, then removes the alias on exit. Running an
app's `dev` script directly (`pnpm --filter @template/frontend dev`) skips
portless and serves plain HTTP on the app's port.

The `api` commands call the same Hono app through the typed RPC client, so they
stay in sync with `packages/api`. They target `$TEMPLATE_API_BASE_URL`, or the
portless frontend URL, or `--base-url`. Node does not read the system trust
store, so the CLI adds the portless CA (`~/.portless/ca.pem`) to its own trust
list to reach `https://*.localhost`.

The package is independently publishable: `pnpm --filter @template/cli build`
bundles it with tsdown, inlining workspace dependencies so `commander` and
`hono` are the only runtime dependencies of the published `template` binary.

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

Regenerate Worker environment types after changing either app's `wrangler.jsonc`:

```sh
pnpm cf-typegen
```
