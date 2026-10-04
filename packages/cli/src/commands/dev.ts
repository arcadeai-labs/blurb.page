import { spawn, spawnSync } from 'node:child_process'
import type { Command } from 'commander'
import { APP_NAMES, APP_PORTS, type AppName, isAppName } from '../lib/apps.ts'
import { openBrowser } from '../lib/browser.ts'
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

/** Registers `app`'s portless alias and starts its `dev` script behind it. */
function startApp(app: AppName, options: DevOptions, repoRoot: string) {
  const { routeName, url } = getPortlessRoute(app, repoRoot)
  const port = APP_PORTS[app]

  killPort(port)
  run(
    ['exec', 'portless', 'alias', routeName, String(port), '--force'],
    repoRoot,
  )

  const env = { ...process.env }
  env.PORT = String(port)
  env.HOST = options.host
  // The dev server is reached through the portless HTTPS proxy, so clients
  // (for example Vite's HMR socket) have to be pointed at that hostname,
  // not the port.
  env.PORTLESS_HOST = `${routeName}.localhost`
  // The frontend proxies `/api` and `/mcp` to the Node API server.
  env.API_ORIGIN = `http://${options.host}:${APP_PORTS.server}`
  // The MCP server links to apps on the frontend.
  env.FRONTEND_URL = getPortlessRoute('frontend', repoRoot).url

  const child = spawn('pnpm', ['--filter', `@template/${app}`, 'run', 'dev'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: isWindows,
  })

  console.log(`\n  ${app} → ${url}\n`)

  return { app, child, routeName, url }
}

export function registerDevCommand(program: Command) {
  program
    .command('dev')
    .description('Run apps behind the portless HTTPS proxy')
    .argument('[apps...]', `apps to run (${APP_NAMES.join(', ')})`, [
      'server',
      'frontend',
    ])
    .option('--no-open', 'do not open the browser once the URL is reachable')
    .option('--host <host>', 'address the dev server binds to', '127.0.0.1')
    .action((apps: string[], options: DevOptions) => {
      for (const app of apps) {
        if (!isAppName(app)) {
          throw new Error(
            `Unknown app "${app}". Expected one of: ${APP_NAMES.join(', ')}.`,
          )
        }
      }

      const repoRoot = requireRepoRoot()
      run(['exec', 'portless', 'proxy', 'start', '--https'], repoRoot)

      const running = apps
        .filter(isAppName)
        .map((app) => startApp(app, options, repoRoot))
      // Open the frontend when it's running, otherwise the API docs.
      const opened = running.find(({ app }) => app === 'frontend') ?? running[0]
      const openUrl = opened.app === 'server' ? `${opened.url}/api` : opened.url
      const readyController = new AbortController()

      // Watching for readiness must never take the dev servers down with it.
      waitForUrl(openUrl, { signal: readyController.signal })
        .then((ready) => {
          if (!ready) {
            return
          }
          console.log(`  ready at ${openUrl}`)
          if (options.open) {
            openBrowser(openUrl)
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
        for (const { routeName } of running) {
          run(
            ['exec', 'portless', 'alias', '--remove', routeName],
            repoRoot,
            true,
          )
        }
      }

      function stopAll(signal: NodeJS.Signals) {
        cleanup()
        for (const { child } of running) {
          child.kill(signal)
        }
      }

      const forwardedSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
      for (const signal of forwardedSignals) {
        process.on(signal, () => stopAll(signal))
      }

      // When one app exits, take the others down with it.
      for (const { child } of running) {
        child.on('exit', (code, signal) => {
          stopAll('SIGTERM')
          if (signal) {
            process.kill(process.pid, signal)
            return
          }
          process.exit(code ?? 0)
        })
      }
    })
}
