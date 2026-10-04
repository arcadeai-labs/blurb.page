// Drizzle table definitions. Run `pnpm db:generate` after changing this file.
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Saved scripts, executed in the `run` sandbox with MCP tools as functions. */
export const scripts = pgTable('scripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
  outputSchema: jsonb('output_schema')
    .$type<Record<string, unknown>>()
    .notNull(),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type Script = typeof scripts.$inferSelect
