import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveHarnessBin } from './harness.mjs'

const [name, ...args] = process.argv.slice(2)
if (name === undefined) throw new Error('Usage: node scripts/run-harness-bin.mjs <tool> [...args]')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const toolArgs = name === 'oxlint'
  ? ['--config', resolve(root, '.oxlintrc.json'), '--disable-nested-config', ...args, 'src', 'scripts', '.githooks', 'tsdown.config.ts', 'vitest.config.ts']
  : args
const result = spawnSync(resolveHarnessBin(name), toolArgs, {
  stdio: 'inherit',
  env: process.env,
})

if (result.error !== undefined) throw result.error
process.exit(result.status ?? 1)
