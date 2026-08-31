import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from './proc.js'
import type { LaunchSpec } from './state.js'

/**
 * Source-install detection for the current `dsh` launch.
 *
 * DSH has two official layouts (see the repository README): a published npm
 * package (`npx @deepseek-ai/dsh`, entry `node_modules/@deepseek-ai/dsh/lib/bin.js`)
 * and a git checkout (`pnpm dsh web`, plus the built `apps/cli/lib/bin.js`).
 * The plugin can only run its git-based upgrade against a checkout, so at boot
 * it matches the running entry script against the checkout's root instead of
 * trusting a hardcoded path. The root contract mirrors the repository itself:
 * a `package.json` named `@deepseek-ai/dsh-root`, a `pnpm-workspace.yaml`, and
 * a `git` worktree — the same markers `apps/cli/src/profile-boot.ts` anchors on.
 */

/** Install shape reported to the status API. */
export type InstallKind = 'source' | 'unknown'

export interface SourceDetection {
  /** Absolute path of the matched deepseek-harness checkout root. */
  repoDir: string
  /** Absolute path of the running dsh entry script (from the captured launch). */
  entry: string
  /** 'source-dev' for `apps/cli/src/bin.ts` (tsx), 'built' for `apps/cli/lib/bin.js`. */
  entryKind: 'source-dev' | 'built' | 'unknown'
  /** Best-effort `origin` remote URL; null when git cannot report one. */
  remoteUrl: string | null
}

const ROOT_PACKAGE_NAME = '@deepseek-ai/dsh-root'

/** Launcher flags whose following argument is a value, not the entry script. */
const VALUE_FLAGS = new Set([
  '--import', '--require', '-r', '--loader', '--experimental-loader',
  '--conditions', '--env-file', '-C', '--inspect', '--inspect-brk',
])

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** package.json `name` at `dir`, or null when unreadable. */
function packageName(dir: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  } catch {
    return null
  }
}

/**
 * Resolve the entry script from the captured launch array
 * (`execArgv + argv.slice(1)`). Node flags and their values are skipped; the
 * first argument that resolves to an existing file (absolute, or relative to
 * the launch cwd) is the script. Returns null when nothing matches.
 */
export function resolveEntryScript(launch: LaunchSpec): string | null {
  const args = launch.args ?? []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '') continue
    if (argument.startsWith('-')) {
      // A value-taking flag consumes the next token; an inline value
      // (`--inspect-brk=9229`) is carried inside the same token.
      if (VALUE_FLAGS.has(argument)) index += 1
      continue
    }
    const candidate = isAbsolute(argument) ? argument : resolve(launch.cwd, argument)
    if (fileExists(candidate)) return candidate
  }
  return null
}

/**
 * Walk up from the entry script to the checkout root. Every ancestor directory
 * is checked against the repository contract; the entry must live inside the
 * checkout for a match, so an unrelated path (npm cache, arbitrary cwd) never
 * qualifies.
 */
export function findRepoRoot(entry: string): string | null {
  let dir = dirname(entry)
  for (;;) {
    if (packageName(dir) === ROOT_PACKAGE_NAME
      && fileExists(join(dir, 'pnpm-workspace.yaml'))
      && existsSync(join(dir, '.git'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function runGitCapture(cwd: string, args: readonly string[]): string | null {
  try {
    const result = spawnSync('git', ['-C', cwd, '--no-pager', '-c', 'color.ui=false', ...args], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0 ? (result.stdout ?? '').trim() : null
  } catch {
    return null
  }
}

/**
 * Detect whether the running dsh was launched from a deepseek-harness source
 * checkout, returning the matched root for git-based check/upgrade. Returns
 * null when the launch does not resolve to a checkout (registry/npx install or
 * an unknown entry) — such installs stay outside this plugin's git flow.
 */
export async function detectSourceInstall(launch: LaunchSpec): Promise<SourceDetection | null> {
  const entry = resolveEntryScript(launch)
  if (entry === null) return null
  const repoDir = findRepoRoot(entry)
  if (repoDir === null) return null
  if (runGitCapture(repoDir, ['rev-parse', '--is-inside-work-tree']) !== 'true') return null
  const remoteUrl = runGitCapture(repoDir, ['remote', 'get-url', 'origin'])
  const entryKind: SourceDetection['entryKind'] = /apps[\\/]cli[\\/]src[\\/]bin\.ts$/.test(entry)
    ? 'source-dev'
    : /apps[\\/]cli[\\/]lib[\\/]bin\.js$/.test(entry)
      ? 'built'
      : 'unknown'
  return { repoDir, entry, entryKind, remoteUrl }
}