import { existsSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

/**
 * Walks up from `from` looking for the pnpm workspace root. Commands that drive
 * the repo's dev servers only work from inside a checkout; the published CLI
 * still installs, it just cannot run them.
 */
export function findRepoRoot(from = process.cwd()): string | null {
  let current = from
  const { root } = parse(current)

  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current
    }
    if (current === root) {
      return null
    }
    current = dirname(current)
  }
}

export function requireRepoRoot(from = process.cwd()): string {
  const repoRoot = findRepoRoot(from)

  if (!repoRoot) {
    throw new Error(
      'No pnpm-workspace.yaml found in any parent directory. Run this command from inside the repo.',
    )
  }

  return repoRoot
}
