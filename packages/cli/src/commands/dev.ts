import { spawn, spawnSync } from 'node:child_process'
import type { Command } from 'commander'
import { APP_NAME, APP_PORT } from '../lib/apps.ts'
import { openBrowser } from '../lib/browser.ts'
import { localMcpUrl, writeMcpConfig } from '../lib/mcp-config.ts'
import { getPortlessRoute } from '../lib/portless.ts'
import { waitForUrl } from '../lib/wait-for-url.ts'
import { requireRepoRoot } from '../lib/workspace.ts'

const isWindows = process.platform === 'win32'

function run(args: string[], cwd: string, quiet = false) {
  return spawnSync('pnpm', args, {
    cwd,
    stdio: quiet ? 'ignore' : 'inherit',
    encoding: 'utf8',
    shell: isWindows,
  })
}

/** Frees the fixed dev port so a stale server does not shadow the new one. */
function killPort(port: number) {
  if (isWindows) {
    return
  }

  const result = spawnSync('lsof', ['-ti', `tcp:${port}`], {
    encoding: 'utf8',
  })
  const pids = (result.stdout ?? '')
    .split('\n')
    .map((pid) => pid.trim())
    .filter(Boolean)

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM')
    } catch {
      // Process may have exited between lsof and kill.
    }
  }
}

type DevOptions = { open: boolean; host: string }

/** Registers the app's portless alias and starts its `dev` script behind it. */
function startApp(options: DevOptions, repoRoot: string) {
  const { routeName, url } = getPortlessRoute(APP_NAME, repoRoot)

  killPort(APP_PORT)
  run(
    ['exec', 'portless', 'alias', routeName, String(APP_PORT), '--force'],
    repoRoot,
  )

  const env = { ...process.env }
  env.PORT = String(APP_PORT)
  env.HOST = options.host
  // The dev server is reached through the portless HTTPS proxy, so clients
  // (for example Vite's HMR socket) have to be pointed at that hostname,
  // not the port.
  env.PORTLESS_HOST = `${routeName}.localhost`
  // The MCP server links to apps on the portless URL, not the loopback
  // address MCP clients reach it at.
  env.FRONTEND_URL = url

  const child = spawn(
    'pnpm',
    ['--filter', `@template/${APP_NAME}`, 'run', 'dev'],
    { cwd: repoRoot, env, stdio: 'inherit', shell: isWindows },
  )

  console.log(`\n  ${APP_NAME} → ${url}\n`)

  return { child, routeName, url }
}

export function registerDevCommand(program: Command) {
  program
    .command('dev')
    .description('Run the app (UI, API and MCP server) behind portless')
    .option('--no-open', 'do not open the browser once the URL is reachable')
    .option('--host <host>', 'address the dev server binds to', '127.0.0.1')
    .action((options: DevOptions) => {
      const repoRoot = requireRepoRoot()
      run(['exec', 'portless', 'proxy', 'start', '--https'], repoRoot)

      const { child, routeName, url } = startApp(options, repoRoot)

      // Point MCP clients opened in this checkout (e.g. Claude Code) at the
      // MCP server that was just started.
      const mcpUrl = localMcpUrl(options.host, APP_PORT)
      const changed = writeMcpConfig(repoRoot, mcpUrl)

      console.log(
        `  mcp → ${mcpUrl}${changed ? ' (updated .mcp.json; reconnect your MCP client)' : ''}\n`,
      )

      const readyController = new AbortController()

      // Watching for readiness must never take the dev server down with it.
      waitForUrl(url, { signal: readyController.signal })
        .then((ready) => {
          if (!ready) {
            return
          }
          console.log(`  ready at ${url}`)
          if (options.open) {
            openBrowser(url)
          }
        })
        .catch(() => {})

      let cleanedUp = false
      function cleanup() {
        if (cleanedUp) {
          return
        }
        cleanedUp = true
        readyController.abort()
        run(
          ['exec', 'portless', 'alias', '--remove', routeName],
          repoRoot,
          true,
        )
      }

      const forwardedSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
      for (const signal of forwardedSignals) {
        process.on(signal, () => {
          cleanup()
          child.kill(signal)
        })
      }

      child.on('exit', (code, signal) => {
        cleanup()
        if (signal) {
          process.kill(process.pid, signal)
          return
        }
        process.exit(code ?? 0)
      })
    })
}
