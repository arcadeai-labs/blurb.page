import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Imported before the API so `DATABASE_URL`, `MCP_URL`, etc. are set when it
// loads. Variables already in the environment win over the repo-root files.
for (const file of ['../../../.env.local', '../../../.env']) {
  const path = fileURLToPath(new URL(file, import.meta.url))

  if (existsSync(path)) {
    process.loadEnvFile(path)
  }
}
