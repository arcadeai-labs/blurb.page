import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

import { localDatabaseUrl } from './src/db'

// `DATABASE_URL` from the environment wins, then the repo-root env files.
for (const file of ['../../.env.local', '../../.env']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? localDatabaseUrl },
})
