// Writes src/routeTree.gen.ts without starting a dev server or running a
// build. The TanStack Start Vite plugin generates the route tree while the
// config resolves, so resolving it is enough. The file is gitignored, so
// anything that needs it before `vite dev`/`vite build` runs (e.g. `tsc`)
// calls this first. Some plugins leave handles open, hence the explicit exit.
import { resolveConfig } from 'vite'

await resolveConfig({}, 'build')
process.exit(0)
