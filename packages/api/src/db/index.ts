import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

/** Served by `pnpm db:local` (PGlite over the Postgres wire protocol). */
export const localDatabaseUrl =
  'postgres://postgres:postgres@127.0.0.1:5433/postgres'

/**
 * Creates a Drizzle client for any Postgres URL. PGlite serves every
 * connection from one session, so concurrent queries on several connections
 * interleave and fail; a database on this machine gets a single connection.
 */
export function createDb(url: string) {
  const { hostname } = new URL(url)
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(hostname)

  return drizzle(postgres(url, local ? { max: 1 } : {}), { schema })
}

export type Db = ReturnType<typeof createDb>

let db: Db | undefined

/** The process-wide client, connected to `DATABASE_URL` or local PGlite. */
export function getDb() {
  db ??= createDb(process.env.DATABASE_URL ?? localDatabaseUrl)
  return db
}
