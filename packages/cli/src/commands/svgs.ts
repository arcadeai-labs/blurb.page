import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import {
  assertOk,
  readJson,
  resolveBaseUrl,
  withApi,
} from '../lib/api-client.ts'

type BaseOptions = { baseUrl?: string; json?: boolean }

type SvgOptions = BaseOptions & {
  name?: string
  description?: string
  file?: string
}

const BASE_URL_HELP =
  'API origin (defaults to $TEMPLATE_API_BASE_URL, then the portless server URL)'

function withOptions(command: Command) {
  return command
    .option('--base-url <url>', BASE_URL_HELP)
    .option('--json', 'print the raw JSON response')
}

function withSvgOptions(command: Command) {
  return withOptions(command)
    .option('--name <name>', 'SVG name')
    .option('--description <text>', 'what the image shows')
    .option('--file <path>', '.svg file with the markup')
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2))
}

function svgBody(options: SvgOptions) {
  return {
    name: options.name,
    description: options.description,
    markup: options.file ? readFileSync(options.file, 'utf8') : undefined,
  }
}

export function registerSvgCommands(api: Command) {
  const svgs = api
    .command('svgs')
    .description('Create, read, update and delete SVGs that apps show')

  withOptions(svgs.command('list').description('GET /api/svgs')).action(
    async (options: BaseOptions) => {
      const list = await withApi(
        resolveBaseUrl(options.baseUrl),
        async (client) => readJson(await client.svgs.$get()),
      )

      if (options.json) {
        printJson(list)
        return
      }

      for (const svg of list) {
        console.log(`${svg.id}  ${svg.name}`)
      }
    },
  )

  withOptions(
    svgs.command('get').argument('<id>').description('GET /api/svgs/:id'),
  ).action(async (id: string, options: BaseOptions) => {
    const svg = await withApi(resolveBaseUrl(options.baseUrl), async (client) =>
      readJson(await client.svgs[':id'].$get({ param: { id } })),
    )

    if (options.json) {
      printJson(svg)
      return
    }

    console.log(svg.markup)
  })

  withSvgOptions(svgs.command('create').description('POST /api/svgs')).action(
    async (options: SvgOptions) => {
      const { name, description, markup } = svgBody(options)

      if (!name || !description || !markup) {
        throw new Error('--name, --description and --file are required')
      }

      const svg = await withApi(
        resolveBaseUrl(options.baseUrl),
        async (client) =>
          readJson(
            await client.svgs.$post({ json: { name, description, markup } }),
          ),
      )

      console.log(options.json ? JSON.stringify(svg, null, 2) : svg.id)
    },
  )

  withSvgOptions(
    svgs.command('update').argument('<id>').description('PATCH /api/svgs/:id'),
  ).action(async (id: string, options: SvgOptions) => {
    const svg = await withApi(resolveBaseUrl(options.baseUrl), async (client) =>
      readJson(
        await client.svgs[':id'].$patch({
          param: { id },
          json: svgBody(options),
        }),
      ),
    )

    console.log(options.json ? JSON.stringify(svg, null, 2) : svg.id)
  })

  withOptions(
    svgs.command('delete').argument('<id>').description('DELETE /api/svgs/:id'),
  ).action(async (id: string, options: BaseOptions) => {
    await withApi(resolveBaseUrl(options.baseUrl), async (client) =>
      assertOk(await client.svgs[':id'].$delete({ param: { id } })),
    )
  })
}
