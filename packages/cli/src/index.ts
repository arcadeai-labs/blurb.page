#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { registerApiCommands } from './commands/api.ts'
import { registerDevCommand } from './commands/dev.ts'

// Resolves to the package root both from `src/index.ts` and the bundled
// `dist/index.js`.
const manifestPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'package.json',
)
const { version, description } = JSON.parse(readFileSync(manifestPath, 'utf8'))

const program = new Command()

program
  .name('template')
  .description(description)
  .version(version)
  .showHelpAfterError()

registerDevCommand(program)
registerApiCommands(program)

try {
  await program.parseAsync(process.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
