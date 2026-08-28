import { spawnSync } from 'node:child_process'
import { resolveHarnessBin } from './harness.mjs'

const [name, ...args] = process.argv.slice(2)
if (name === undefined) throw new Error('Usage: node scripts/run-harness-bin.mjs <tool> [...args]')

const result = spawnSync(resolveHarnessBin(name), args, {
  stdio: 'inherit',
  env: process.env,
})

if (result.error !== undefined) throw result.error
process.exit(result.status ?? 1)
