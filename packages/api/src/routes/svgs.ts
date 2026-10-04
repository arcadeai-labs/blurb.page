import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { desc, eq } from 'drizzle-orm'

import { getDb } from '../db'
import { isUniqueViolation } from '../db/errors'
import { svgs } from '../db/schema'
import { svgFields, svgSchema, svgSummarySchema } from '../svg-fields'
import { toSvgJson, toSvgSummary } from '../svgs'

const svg = svgSchema
  .extend({
    markup: z.string().openapi({
      example:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>',
    }),
  })
  .openapi('Svg')

// Only schemas made after @hono/zod-openapi has patched zod have .openapi(),
// and the production bundle can create the shared ones in ../svg-fields
// before that, so build route schemas here from their shapes.
const svgSummary = z.object(svgSummarySchema.shape).openapi('SvgSummary')

const createSvgSchema = z.object(svgFields).openapi('CreateSvg')

const updateSvgSchema = createSvgSchema.partial().openapi('UpdateSvg')

const errorSchema = z.object({ error: z.string() }).openapi('Error')

const idParams = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const notFound = json(errorSchema, 'SVG not found')

const nameTaken = json(errorSchema, 'An SVG with that name already exists')

const listRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List SVGs (without markup)',
  responses: { 200: json(z.array(svgSummary), 'All SVGs') },
})

const createSvgRoute = createRoute({
  method: 'post',
  path: '/',
  summary: 'Create an SVG',
  request: {
    body: { content: { 'application/json': { schema: createSvgSchema } } },
  },
  responses: { 201: json(svg, 'The created SVG'), 409: nameTaken },
})

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  summary: 'Get an SVG',
  request: { params: idParams },
  responses: { 200: json(svg, 'The SVG'), 404: notFound },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  summary: 'Update an SVG',
  request: {
    params: idParams,
    body: { content: { 'application/json': { schema: updateSvgSchema } } },
  },
  responses: {
    200: json(svg, 'The updated SVG'),
    404: notFound,
    409: nameTaken,
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  summary: 'Delete an SVG',
  request: { params: idParams },
  responses: { 204: { description: 'Deleted' }, 404: notFound },
})

export const svgsRoutes = new OpenAPIHono()
  .openapi(listRoute, async (c) => {
    const rows = await getDb().select().from(svgs).orderBy(desc(svgs.updatedAt))

    return c.json(rows.map(toSvgSummary), 200)
  })
  .openapi(createSvgRoute, async (c) => {
    try {
      const [row] = await getDb()
        .insert(svgs)
        .values(c.req.valid('json'))
        .returning()

      return c.json(toSvgJson(row), 201)
    } catch (error) {
      if (isUniqueViolation(error)) {
        return c.json({ error: 'An SVG with that name already exists' }, 409)
      }
      throw error
    }
  })
  .openapi(getRoute, async (c) => {
    const [row] = await getDb()
      .select()
      .from(svgs)
      .where(eq(svgs.id, c.req.valid('param').id))

    if (!row) {
      return c.json({ error: 'SVG not found' }, 404)
    }

    return c.json(toSvgJson(row), 200)
  })
  .openapi(updateRoute, async (c) => {
    try {
      const [row] = await getDb()
        .update(svgs)
        .set(c.req.valid('json'))
        .where(eq(svgs.id, c.req.valid('param').id))
        .returning()

      if (!row) {
        return c.json({ error: 'SVG not found' }, 404)
      }

      return c.json(toSvgJson(row), 200)
    } catch (error) {
      if (isUniqueViolation(error)) {
        return c.json({ error: 'An SVG with that name already exists' }, 409)
      }
      throw error
    }
  })
  .openapi(deleteRoute, async (c) => {
    const [row] = await getDb()
      .delete(svgs)
      .where(eq(svgs.id, c.req.valid('param').id))
      .returning({ id: svgs.id })

    if (!row) {
      return c.json({ error: 'SVG not found' }, 404)
    }

    return c.body(null, 204)
  })
