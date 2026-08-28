import { accessSync, constants, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const fallbackHarnessDir = '/home/mao/deepseek-harness'

/** Locate a harness checkout with its installed build tools. */
export function resolveHarnessDir() {
  const harnessDir = resolve(process.env.DSH_HARNESS_DIR ?? fallbackHarnessDir)
  const clientPreset = resolve(harnessDir, 'packages/client/tsdown.client.ts')
  const tsdown = resolve(harnessDir, 'node_modules/.bin/tsdown')

  if (!existsSync(clientPreset) || !existsSync(tsdown)) {
    throw new Error(
      `DeepSeek Harness tools are unavailable at ${harnessDir}. Set DSH_HARNESS_DIR to an installed harness checkout.`,
    )
  }

  accessSync(tsdown, constants.X_OK)
  return harnessDir
}

/** Resolve one executable supplied by the selected harness checkout. */
export function resolveHarnessBin(name) {
  const executable = resolve(resolveHarnessDir(), 'node_modules/.bin', name)
  if (!existsSync(executable)) {
    throw new Error(`DeepSeek Harness does not provide ${name}. Run pnpm install in the selected checkout.`)
  }
  accessSync(executable, constants.X_OK)
  return executable
}
