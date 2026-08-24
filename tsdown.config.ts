import { clientBundle } from '/home/mao/deepseek-harness/packages/client/tsdown.client.ts'

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