Use drizzle for any db.
I want the following commands available at repo root:
- pnpm db:generate (drizzle generate)
- pnpm db:migrate (drizzle migration)
- pnpm db:studio (drizzle studio)
Start with PGlite for easy local dev with an easy migration path to swapping a real Postgres URL
Do NOT auto-migrate on startup
Everything runs on plain Node (the run SDK needs node:worker_threads): apps/frontend is one server that serves the UI, the API at /api and the MCP server at /mcp
Keep it host-agnostic: no Vercel- or Cloudflare-specific code. Nitro builds it for Vercel when deployed there, and `node .output/server/index.mjs` runs it anywhere else (e.g. Docker)
Any API changes should be in packages/api. 
The CLI lives in packages/cli (`pnpm cli`); it must stay independently publishable, so keep its runtime deps bundleable and reach the API through Hono RPC.
When making frontend changes, always prefer:
- Use TanStack Query and handle loading/error states gracefully
- Use Hono RPC for interfacing with backend -- NEVER do raw/untyped fetch calls
- Use shadcn components with no additional styling. Don't get too creative with a frontend.
