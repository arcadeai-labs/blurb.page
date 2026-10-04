Use drizzle for any db.
I want the following commands available at repo root:
- pnpm db:generate (drizzle generate)
- pnpm db:migrate (drizzle migration)
- pnpm db:studio (drizzle studio)
Start with PGlite for easy local dev with an easy migration path to swapping a real Postgres URL
Do NOT auto-migrate on startup
The API (packages/api, apps/server) is Node-only because the run SDK needs node:worker_threads; the frontend stays Wrangler-compatible
Don't create custom bindings/types for Cloudflare, generate them with wrangler CLI
Any API changes should be in packages/api. 
The CLI lives in packages/cli (`pnpm cli`); it must stay independently publishable, so keep its runtime deps bundleable and reach the API through Hono RPC.
When making frontend changes, always prefer:
- Use TanStack Query and handle loading/error states gracefully
- Use Hono RPC for interfacing with backend -- NEVER do raw/untyped fetch calls
- Use shadcn components with no additional styling. Don't get too creative with a frontend.
