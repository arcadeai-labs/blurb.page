import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

import { localDatabaseUrl } from './src/db'

// A `DATABASE_URL` in the environment wins over the repo-root env files, along
// with its `DATABASE_URL_UNPOOLED`, so the two always point at the same branch.
if (!process.env.DATABASE_URL) {
  for (const file of ['../../.env.local', '../../.env']) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // Neon recommends its direct (unpooled) connection for migrations.
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      localDatabaseUrl,
  },
})
