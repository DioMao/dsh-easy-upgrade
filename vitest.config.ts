// Vitest config. Plain object (no `defineConfig` import) so the config loader
// never has to resolve the `vitest` package from this package's node_modules,
// which is a symlink into the shared DSH profile store.
export default {
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}
