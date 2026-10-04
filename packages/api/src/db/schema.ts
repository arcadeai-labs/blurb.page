// Drizzle table definitions. Run `pnpm db:generate` after changing this file.
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import type { ActionBinding, AppSpec } from '../ui/app'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/** Saved scripts, executed in the `run` sandbox with MCP tools as functions. */
export const scripts = pgTable('scripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Apps run scripts by name.
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
  outputSchema: jsonb('output_schema')
    .$type<Record<string, unknown>>()
    .notNull(),
  source: text('source').notNull(),
  ...timestamps,
})

export type Script = typeof scripts.$inferSelect

/** json-render UIs whose actions run scripts, served at `/apps/<name>`. */
export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  spec: jsonb('spec').$type<AppSpec>().notNull(),
  onLoad: jsonb('on_load').$type<ActionBinding[]>().notNull().default([]),
  ...timestamps,
})

export type App = typeof apps.$inferSelect

/** Markdown pages with embedded json-render components, served at `/docs/<name>`. */
export const docs = pgTable('docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  title: text('title').notNull(),
  // Markdown; ```ui code blocks hold component specs.
  body: text('body').notNull().default(''),
  ...timestamps,
})

export type Doc = typeof docs.$inferSelect

/**
 * Clients registered with Arcade's OAuth server for local origins, which
 * can't serve a client metadata document Arcade can fetch (see `auth/arcade`).
 */
export const arcadeClients = pgTable('arcade_clients', {
  origin: text('origin').primaryKey(),
  clientId: text('client_id').notNull(),
  ...timestamps,
})

export * from './auth-schema'
