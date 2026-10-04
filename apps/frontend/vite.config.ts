import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import path from 'node:path'

// The API (`packages/api`) reads `DATABASE_URL`, `MCP_URL`, etc. from the
// environment. Variables already set win over the repo-root env files.
for (const file of ['../../.env.local', '../../.env']) {
  const envPath = path.resolve(__dirname, file)

  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }
}

// Set by `template dev` when the dev server sits behind the portless HTTPS
// proxy, which terminates TLS on 443 and forwards to this Vite server.
const portlessHost = process.env.PORTLESS_HOST

// https://vite.dev/config/
export default defineConfig({
  server: portlessHost
    ? { hmr: { protocol: 'wss', host: portlessHost, clientPort: 443 } }
    : {},
  plugins: [
    tanstackStart({
      srcDirectory: '.',
      router: {
        entry: 'src/router.tsx',
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      },
    }),
    nitro(),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
