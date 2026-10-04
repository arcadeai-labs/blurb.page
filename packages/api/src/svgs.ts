import type { Svg } from './db/schema'

export function toSvgSummary(row: Svg) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toSvgJson(row: Svg) {
  return {
    ...toSvgSummary(row),
    markup: row.markup,
    createdAt: row.createdAt.toISOString(),
  }
}
