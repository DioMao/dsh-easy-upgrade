import crossSpawn from 'cross-spawn'
import type { ChildProcess, SpawnOptions, SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process'

/**
 * Host-side platform adapter. All process launching and target-stop decisions
 * for the upgrade flow funnel through this module so the platform differences
 * stay in one place:
 *   - Windows launches the POSIX-less toolchain through `cross-spawn`, which
 *     routes `.cmd`/`.bat` shims (pnpm) and executables (git) correctly.
 *   - Stopping the current DSH on Windows terminates the whole process tree
 *     (`taskkill /T /F`) so no child process keeps the build files locked;
 *     POSIX keeps the graceful SIGTERM → timeout → SIGKILL sequence.
 *
 * The detached upgrade runner (an inline string in upgrade-runner.ts) cannot
 * import this module — it runs with no dependency resolution — so it carries a
 * small inline copy of the same decision logic. Keep the two in sync.
 */

/** Process families the adapter knows; 'posix' covers Linux and macOS. */
export type PlatformKind = 'windows' | 'posix'

/** Map a Node platform string to the adapter's process family. */
export function platformKind(platform: string = process.platform): PlatformKind {
  return platform === 'win32' ? 'windows' : 'posix'
}

/** Action taken to stop the running DSH before the checkout is reset. */
export type StopAction =
  | { mode: 'taskkill'; command: string; args: string[] }
  | { mode: 'signal' }

/**
 * Decide how to stop the current DSH process. Windows cannot send POSIX
 * signals, so it explicitly terminates the target's whole process tree;
 * POSIX keeps the graceful signal sequence (implemented in the runner).
 */
export function stopUpgradeTarget(targetPid: number, kind: PlatformKind): StopAction {
  if (kind === 'windows') {
    // taskkill /PID <pid> /T /F: /T kills the tree, /F is unconditional so a
    // hung DSH cannot keep child build processes alive.
    return { mode: 'taskkill', command: 'taskkill', args: ['/PID', String(targetPid), '/T', '/F'] }
  }
  return { mode: 'signal' }
}

/** Cross-platform spawn; see module note on `cross-spawn`. */
export function spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
  return crossSpawn(command, args as string[], options)
}

/** Cross-platform synchronous spawn for capture-style call sites. */
export function spawnSync(command: string, args: readonly string[], options?: SpawnSyncOptions): SpawnSyncReturns<Buffer> {
  return crossSpawn.sync(command, args as string[], options)
}