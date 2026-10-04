import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import {
  assertOk,
  readJson,
  resolveBaseUrl,
  withApi,
} from '../lib/api-client.ts'

type BaseOptions = { baseUrl?: string; json?: boolean }

type ScriptOptions = BaseOptions & {
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

function withScriptOptions(command: Command) {
  return withOptions(command)
    .option('--name <name>', 'script name')
    .option('--description <text>', 'script description')
    .option('--file <path>', 'file with the script source')
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2))
}

function scriptBody(options: ScriptOptions) {
  return {
    name: options.name,
    description: options.description,
    source: options.file ? readFileSync(options.file, 'utf8') : undefined,
  }
}

export function registerScriptCommands(api: Command) {
  withOptions(
    api
      .command('tools')
      .description('GET /api/tools — MCP tools callable from scripts'),
  ).action(async (options: BaseOptions) => {
    const tools = await withApi(
      resolveBaseUrl(options.baseUrl),
      async (client) => readJson(await client.tools.$get()),
    )

    if (options.json) {
      printJson(tools)
      return
    }

    for (const tool of tools) {
      console.log(`tools.${tool.functionName}  ${tool.description ?? ''}`)
    }
  })

  const scripts = api
    .command('scripts')
    .description('Create, read, update, delete and execute scripts')

  withOptions(scripts.command('list').description('GET /api/scripts')).action(
    async (options: BaseOptions) => {
      const list = await withApi(
        resolveBaseUrl(options.baseUrl),
        async (client) => readJson(await client.scripts.$get()),
      )

      if (options.json) {
        printJson(list)
        return
      }

      for (const script of list) {
        console.log(`${script.id}  ${script.name}`)
      }
    },
  )

  withOptions(
    scripts.command('get').argument('<id>').description('GET /api/scripts/:id'),
  ).action(async (id: string, options: BaseOptions) => {
    const script = await withApi(
      resolveBaseUrl(options.baseUrl),
      async (client) =>
        readJson(await client.scripts[':id'].$get({ param: { id } })),
    )

    if (options.json) {
      printJson(script)
      return
    }

    console.log(`# ${script.name} (${script.id})\n`)
    console.log(script.source)
  })

  withScriptOptions(
    scripts.command('create').description('POST /api/scripts'),
  ).action(async (options: ScriptOptions) => {
    const { name, description, source } = scriptBody(options)

    if (!name || !source) {
      throw new Error('--name and --file are required')
    }

    const script = await withApi(
      resolveBaseUrl(options.baseUrl),
      async (client) =>
        readJson(
          await client.scripts.$post({ json: { name, description, source } }),
        ),
    )

    console.log(options.json ? JSON.stringify(script, null, 2) : script.id)
  })

  withScriptOptions(
    scripts
      .command('update')
      .argument('<id>')
      .description('PATCH /api/scripts/:id'),
  ).action(async (id: string, options: ScriptOptions) => {
    const script = await withApi(
      resolveBaseUrl(options.baseUrl),
      async (client) =>
        readJson(
          await client.scripts[':id'].$patch({
            param: { id },
            json: scriptBody(options),
          }),
        ),
    )

    console.log(options.json ? JSON.stringify(script, null, 2) : script.id)
  })

  withOptions(
    scripts
      .command('delete')
      .argument('<id>')
      .description('DELETE /api/scripts/:id'),
  ).action(async (id: string, options: BaseOptions) => {
    await withApi(resolveBaseUrl(options.baseUrl), async (client) =>
      assertOk(await client.scripts[':id'].$delete({ param: { id } })),
    )
  })

  withOptions(
    scripts
      .command('execute')
      .argument('<id>')
      .description('POST /api/scripts/:id/execute — run it in the sandbox'),
  ).action(async (id: string, options: BaseOptions) => {
    const result = await withApi(
      resolveBaseUrl(options.baseUrl),
      async (client) =>
        readJson(await client.scripts[':id'].execute.$post({ param: { id } })),
    )

    if (options.json) {
      printJson(result)
      return
    }

    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`)
    }

    printJson(result.value)
  })
}
