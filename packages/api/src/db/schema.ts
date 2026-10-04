// Drizzle table definitions. Run `pnpm db:generate` after changing this file.
import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import type { ActionBinding, AppSpec } from '../ui/app'
import { user } from './auth-schema'

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

/** SVG images, shown in apps by name with the Svg component. */
export const svgs = pgTable('svgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  markup: text('markup').notNull(),
  ...timestamps,
})

export type Svg = typeof svgs.$inferSelect

/**
 * Clients registered with Arcade's OAuth server for local origins, which
 * can't serve a client metadata document Arcade can fetch (see `auth/arcade`).
 */
export const arcadeClients = pgTable(
  'arcade_clients',
  {
    // The OAuth server it's registered with: Arcade stacks don't share them.
    issuer: text('issuer').notNull(),
    origin: text('origin').notNull(),
    clientId: text('client_id').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.issuer, table.origin] })],
)

/**
 * The MCP gateway each user picked, which their tool calls go to. Users
 * without one use the default gateway (`MCP_URL`).
 */
export const userGateways = pgTable('user_gateways', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull(),
  projectId: text('project_id').notNull(),
  gatewayId: text('gateway_id').notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  ...timestamps,
})

export type UserGateway = typeof userGateways.$inferSelect

export * from './auth-schema'
