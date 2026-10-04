import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { desc, eq } from 'drizzle-orm'

import { getDb } from '../db'
import { type Script, scripts } from '../db/schema'
import { executeScript } from '../execute'
import { McpUnavailableError } from '../mcp'

const scriptSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    source: z.string().openapi({
      example: 'return await tools.Gmail_ListEmails({ n_emails: 5 })',
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Script')

const createScriptSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    source: z.string().min(1),
  })
  .openapi('CreateScript')

const updateScriptSchema = createScriptSchema.partial().openapi('UpdateScript')

const errorSchema = z.object({ error: z.string() }).openapi('Error')

const executeResultSchema = z
  .discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: z.unknown() }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ])
  .openapi('ExecuteResult')

const idParams = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const notFound = json(errorSchema, 'Script not found')

function toJson(script: Script) {
  return {
    ...script,
    createdAt: script.createdAt.toISOString(),
    updatedAt: script.updatedAt.toISOString(),
  }
}

const listRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List scripts',
  responses: { 200: json(z.array(scriptSchema), 'All scripts') },
})

const createScriptRoute = createRoute({
  method: 'post',
  path: '/',
  summary: 'Create a script',
  request: {
    body: { content: { 'application/json': { schema: createScriptSchema } } },
  },
  responses: { 201: json(scriptSchema, 'The created script') },
})

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  summary: 'Get a script',
  request: { params: idParams },
  responses: { 200: json(scriptSchema, 'The script'), 404: notFound },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  summary: 'Update a script',
  request: {
    params: idParams,
    body: { content: { 'application/json': { schema: updateScriptSchema } } },
  },
  responses: { 200: json(scriptSchema, 'The updated script'), 404: notFound },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  summary: 'Delete a script',
  request: { params: idParams },
  responses: { 204: { description: 'Deleted' }, 404: notFound },
})

const executeRoute = createRoute({
  method: 'post',
  path: '/{id}/execute',
  summary: 'Execute a script',
  description:
    'Runs the script in the `run` QuickJS sandbox. Every tool on the MCP server at `MCP_URL` is available as `tools.<name>(args)`. Script failures are returned as `ok: false`.',
  request: { params: idParams },
  responses: {
    200: json(executeResultSchema, 'The script result or its error'),
    404: notFound,
    503: json(errorSchema, 'The MCP server is not configured or unreachable'),
  },
})

async function findScript(id: string) {
  const [script] = await getDb()
    .select()
    .from(scripts)
    .where(eq(scripts.id, id))
  return script
}

export const scriptsRoutes = new OpenAPIHono()
  .openapi(listRoute, async (c) => {
    const rows = await getDb()
      .select()
      .from(scripts)
      .orderBy(desc(scripts.updatedAt))

    return c.json(rows.map(toJson), 200)
  })
  .openapi(createScriptRoute, async (c) => {
    const [script] = await getDb()
      .insert(scripts)
      .values(c.req.valid('json'))
      .returning()

    return c.json(toJson(script), 201)
  })
  .openapi(getRoute, async (c) => {
    const script = await findScript(c.req.valid('param').id)

    if (!script) {
      return c.json({ error: 'Script not found' }, 404)
    }

    return c.json(toJson(script), 200)
  })
  .openapi(updateRoute, async (c) => {
    const [script] = await getDb()
      .update(scripts)
      .set(c.req.valid('json'))
      .where(eq(scripts.id, c.req.valid('param').id))
      .returning()

    if (!script) {
      return c.json({ error: 'Script not found' }, 404)
    }

    return c.json(toJson(script), 200)
  })
  .openapi(deleteRoute, async (c) => {
    const [script] = await getDb()
      .delete(scripts)
      .where(eq(scripts.id, c.req.valid('param').id))
      .returning({ id: scripts.id })

    if (!script) {
      return c.json({ error: 'Script not found' }, 404)
    }

    return c.body(null, 204)
  })
  .openapi(executeRoute, async (c) => {
    const script = await findScript(c.req.valid('param').id)

    if (!script) {
      return c.json({ error: 'Script not found' }, 404)
    }

    try {
      return c.json(await executeScript(script.source, c.req.raw.signal), 200)
    } catch (error) {
      if (error instanceof McpUnavailableError) {
        return c.json({ error: error.message }, 503)
      }
      throw error
    }
  })
