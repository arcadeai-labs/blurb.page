import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Set by `template dev` when the dev server sits behind the portless HTTPS
// proxy, which terminates TLS on 443 and forwards to this Vite server.
const portlessHost = process.env.PORTLESS_HOST

// https://vite.dev/config/
export default defineConfig({
  server: portlessHost
    ? { hmr: { protocol: 'wss', host: portlessHost, clientPort: 443 } }
    : {},
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart({
      srcDirectory: '.',
      router: {
        entry: 'src/router.tsx',
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      },
      server: {
        entry: 'src/server.ts',
      },
    }),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
