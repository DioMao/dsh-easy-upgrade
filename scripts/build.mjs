import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveHarnessBin, resolveHarnessDir } from './harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harnessDir = resolveHarnessDir()
const workspaceDir = resolve(harnessDir, 'packages/experimental/dsh-easy-upgrade')
const manifestPath = resolve(workspaceDir, 'package.json')

if (existsSync(workspaceDir)) {
  throw new Error(`Refusing to overwrite existing harness workspace directory: ${workspaceDir}`)
}

let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  rmSync(workspaceDir, { recursive: true, force: true })
}
const interrupt = code => {
  cleanup()
  process.exit(code)
}

process.once('SIGINT', () => interrupt(130))
process.once('SIGTERM', () => interrupt(143))

rmSync(resolve(root, 'lib'), { recursive: true, force: true })
mkdirSync(workspaceDir, { recursive: true })

try {
  writeFileSync(manifestPath, `${JSON.stringify(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')), null, 2)}\n`)
  const result = spawnSync(resolveHarnessBin('tsdown'), [], {
    cwd: root,
    env: { ...process.env, DSH_HARNESS_DIR: harnessDir },
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
} finally {
  cleanup()
}
