import { spawnSync } from 'node:child_process'

/**
 * Routes are named after the current branch, so every checkout gets its own
 * hostname without any per-branch configuration.
 */
function gitOutput(args: string[], cwd: string) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type PortlessRoute = {
  routeName: string
  url: string
}

export function getPortlessRoute(appName: string, cwd: string): PortlessRoute {
  const branch = slug(gitOutput(['branch', '--show-current'], cwd))
  const branchPrefix =
    branch && !['main', 'master'].includes(branch) ? branch : ''
  const name = branchPrefix ? `${branchPrefix}.${appName}` : appName

  return {
    routeName: name,
    url: `https://${name}.localhost`,
  }
}
