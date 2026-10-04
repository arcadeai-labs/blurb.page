import { spawn, spawnSync } from 'node:child_process'
import type { Command } from 'commander'
import { APP_NAMES, APP_PORTS, isAppName } from '../lib/apps.ts'
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

export function registerDevCommand(program: Command) {
  program
    .command('dev')
    .description('Run an app behind the portless HTTPS proxy')
    .argument('[app]', `app to run (${APP_NAMES.join(', ')})`, 'frontend')
    .option('--no-open', 'do not open the browser once the URL is reachable')
    .option('--host <host>', 'address the dev server binds to', '127.0.0.1')
    .action((app: string, options: { open: boolean; host: string }) => {
      if (!isAppName(app)) {
        throw new Error(
          `Unknown app "${app}". Expected one of: ${APP_NAMES.join(', ')}.`,
        )
      }

      const repoRoot = requireRepoRoot()
      const { routeName, url } = getPortlessRoute(app, repoRoot)
      const port = APP_PORTS[app]

      run(['exec', 'portless', 'proxy', 'start', '--https'], repoRoot)
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

      const child = spawn(
        'pnpm',
        ['--filter', `@template/${app}`, 'run', 'dev'],
        {
          cwd: repoRoot,
          env,
          stdio: 'inherit',
          shell: isWindows,
        },
      )

      const readyController = new AbortController()

      console.log(`\n  ${app} → ${url}\n`)

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
