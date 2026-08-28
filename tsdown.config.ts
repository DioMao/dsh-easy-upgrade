import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const harnessDir = resolve(process.env.DSH_HARNESS_DIR ?? '/home/mao/deepseek-harness')
const { clientBundle } = await import(pathToFileURL(resolve(harnessDir, 'packages/client/tsdown.client.ts')).href)

// Mirror the repository's client-plugin artifact exactly. This standalone
// package transpiles its own host sources directly instead of inheriting the
// monorepo TypeScript project-reference graph; the browser entry still gets
// DSH's module-table factory, external list, purity gate, and source map.
export default clientBundle('dsh-easy-upgrade', ['src/index.ts', 'src/invariant.ts'], {
  lib: {
    entry: {
      index: 'src/index.ts',
      invariant: 'src/invariant.ts',
    },
  },
})