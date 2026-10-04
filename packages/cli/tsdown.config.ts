import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  dts: false,
  outExtensions: () => ({ js: '.js' }),
  deps: {
    // Workspace packages are private, so they have to be inlined for the
    // published CLI to be installable on its own.
    alwaysBundle: [/^@template\//],
  },
})
