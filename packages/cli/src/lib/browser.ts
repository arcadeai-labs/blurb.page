import { spawn } from 'node:child_process'

/** Opens `url` in the default browser, detached so it never blocks the CLI. */
export function openBrowser(url: string) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]

  const child = spawn(command, args, {
    stdio: 'ignore',
    detached: true,
  })

  child.on('error', () => {
    console.error(`Could not open a browser. Visit ${url} manually.`)
  })
  child.unref()
}
