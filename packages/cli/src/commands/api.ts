import type { Command } from 'commander'
import {
  assertOk,
  readJson,
  resolveBaseUrl,
  withApi,
} from '../lib/api-client.ts'
import { openBrowser } from '../lib/browser.ts'

type ApiOptions = {
  baseUrl?: string
  json?: boolean
}

const BASE_URL_HELP =
  'API origin (defaults to $TEMPLATE_API_BASE_URL, then the portless frontend URL)'

/**
 * Shared options for every API subcommand, so `--base-url` can be passed after
 * the subcommand name instead of before it.
 */
function withApiOptions(command: Command) {
  return command
    .option('--base-url <url>', BASE_URL_HELP)
    .option('--json', 'print the raw JSON response')
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2))
}

export function registerApiCommands(program: Command) {
  const api = program
    .command('api')
    .description('Call the Hono API through its typed RPC client')

  withApiOptions(
    api.command('stats').description('GET /api/stats — Worker runtime stats'),
  ).action(async (options: ApiOptions) => {
    const stats = await withApi(
      resolveBaseUrl(options.baseUrl),
      async (client) => readJson(await client.stats.$get()),
    )

    if (options.json) {
      printJson(stats)
      return
    }

    console.log(`region      ${stats.region}`)
    console.log(`uptimeMode  ${stats.uptimeMode}`)
    console.log(`features    ${stats.features.join(', ')}`)
  })

  withApiOptions(
    api
      .command('openapi')
      .description('GET /api/openapi.json — the OpenAPI document'),
  ).action(async (options: ApiOptions) => {
    const spec = await withApi(
      resolveBaseUrl(options.baseUrl),
      async (client) => readJson(await client['openapi.json'].$get()),
    )

    printJson(spec)
  })

  api
    .command('docs')
    .description('GET /api — Swagger UI for the API')
    .option('--base-url <url>', BASE_URL_HELP)
    .option('--open', 'open the Swagger UI in a browser')
    .action(async (options: { baseUrl?: string; open?: boolean }) => {
      const url = await withApi(
        resolveBaseUrl(options.baseUrl),
        async (client) => {
          await assertOk(await client.index.$get())

          return client.index.$url().toString()
        },
      )

      console.log(url)

      if (options.open) {
        openBrowser(url)
      }
    })
}
