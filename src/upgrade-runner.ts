import { closeSync, openSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { UpgradeConfig } from './config.js'
import type { LaunchSpec, StateStore } from './state.js'

export interface UpgradeLaunch {
  repoDir: string
  branch: string
  oldHead: string
  newHead: string
  targetPid: number
  launch: LaunchSpec
}

/**
 * Start an independent Node process that waits for the HTTP response, stops the
 * current DSH process, resets to origin/<branch>, builds, and launches the
 * exact command captured when this plugin activated.
 */
export async function launchUpgradeRunner(store: StateStore, config: UpgradeConfig, launch: UpgradeLaunch): Promise<void> {
  await store.ensure()
  await writeFile(store.runnerPath, RUNNER_SOURCE, { mode: 0o700 })
  const logFd = openSync(store.logPath, 'a', 0o600)
  try {
    const child = spawn(process.execPath, [store.runnerPath, JSON.stringify({
      ...launch,
      statePath: store.statePath,
      logPath: store.logPath,
      config: { repoDir: config.repoDir, branch: config.branch, logMaxBytes: config.logMaxBytes },
    })], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    })
    child.unref()
  } finally {
    closeSync(logFd)
  }
}

/* The runner deliberately has no imports from this plugin. It remains viable
 * after the parent process is terminated and while the target checkout is being
 * reset and rebuilt. Its argument is lossless JSON written by launchUpgradeRunner. */
const RUNNER_SOURCE = String.raw`import { appendFileSync, closeSync, openSync, readFileSync, renameSync, statSync, truncateSync, readSync, writeFileSync, writeSync } from 'node:fs'
import { spawn } from 'node:child_process'

const inputRaw = process.argv[2] ?? ''
let input = {}
try {
  input = JSON.parse(inputRaw || '{}')
} catch {
  input = {}
}
const statePath = input.statePath
const logPath = input.logPath
const now = () => new Date().toISOString()
const logMaxBytes = Number.isFinite(input.logMaxBytes) && input.logMaxBytes > 0 ? input.logMaxBytes : 15 * 1024 * 1024

function currentLogSize() {
  try {
    return logPath ? statSync(logPath).size : 0
  } catch { return 0 }
}

function ensureLogRoom(minBytes) {
  try {
    if (!logPath) return
    const size = currentLogSize()
    if (size + minBytes <= logMaxBytes) return
    let tail = Buffer.alloc(0)
    const keep = Math.min(Math.floor(logMaxBytes * 0.5), size)
    if (keep > 0) {
      try {
        const fd = openSync(logPath, 'r')
        try {
          tail = Buffer.allocUnsafe(keep)
          const { bytesRead } = readSync(fd, tail, 0, keep, size - keep)
          tail = tail.subarray(0, bytesRead)
        } finally { closeSync(fd) }
      } catch { tail = Buffer.alloc(0) }
    }
    truncateSync(logPath, 0)
    const marker = Buffer.from('[... upgrade.log trimmed ...]\\n')
    try {
      const fd = openSync(logPath, 'w')
      try { writeSync(fd, marker); writeSync(fd, tail) } finally { closeSync(fd) }
    } catch {}
  } catch {}
}

const writeCapped = (chunk) => {
  try {
    if (!logPath || !chunk || chunk.byteLength === 0) return
    ensureLogRoom(chunk.byteLength)
    appendFileSync(logPath, chunk)
  } catch {}
}

const log = (message) => {
  try {
    writeCapped(Buffer.from('[' + now() + '] ' + message + '\\n'))
  } catch {}
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function writeState(result) {
  let previous = {}
  try { if (statePath) previous = JSON.parse(readFileSync(statePath, 'utf8')) } catch {}
  const state = {
    ...previous,
    upgrading: false,
    lastUpgrade: result,
  }
  if (!statePath) return
  const temporary = statePath + '.' + process.pid + '.tmp'
  try {
    writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
    renameSync(temporary, statePath)
  } catch (error) {
    log('state write failed: ' + (error instanceof Error ? error.message : String(error)))
  }
}

function run(command, args, cwd, timeoutMs, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    log('$ ' + command + ' ' + args.join(' '))
    if (!logPath) {
      reject(new Error('no log path'))
      return
    }
    const child = spawn(command, args, {
      cwd,
      // CI skips only the repository's development Git-hook installer. Native
      // dependencies still run their normal install scripts.
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    })
    child.stdout.on('data', (chunk) => writeCapped(chunk))
    child.stderr.on('data', (chunk) => writeCapped(chunk))
    child.on('error', (error) => {
      writeCapped(Buffer.from((error && error.message ? error.message : String(error)) + '\n'))
      reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(command + ' exited with ' + String(code)))
    })
  })
}

async function stopCurrent() {
  if (!Number.isInteger(input.targetPid) || input.targetPid <= 1) throw new Error('invalid current DSH pid')
  try {
    process.kill(input.targetPid, 'SIGTERM')
    log('sent SIGTERM to current DSH pid ' + input.targetPid)
  } catch (error) {
    if (error && error.code !== 'ESRCH') throw error
    return
  }
  for (let index = 0; index < 20; index += 1) {
    await sleep(500)
    try { process.kill(input.targetPid, 0) } catch { return }
  }
  try {
    process.kill(input.targetPid, 'SIGKILL')
    log('sent SIGKILL fallback to current DSH pid ' + input.targetPid)
  } catch (error) {
    if (!error || error.code !== 'ESRCH') throw error
  }
}

function restart() {
  if (!logPath || !input.launch) return
  const fd = openSync(logPath, 'a', 0o600)
  const child = spawn(input.launch.execPath, input.launch.args, {
    cwd: input.launch.cwd,
    detached: true,
    env: process.env,
    stdio: ['ignore', fd, fd],
  })
  child.unref()
  closeSync(fd)
  log('restarted DSH as pid ' + child.pid)
}

async function main() {
  let stage = 'startup'
  let stopped = false
  let success = false
  let errorText
  try {
    // Bring an already-oversized log back under the cap before this upgrade writes.
    ensureLogRoom(0)
    if (!statePath || !logPath || !input.repoDir || !input.branch || !input.oldHead || !input.launch) {
      throw new Error('runner input missing required fields')
    }
    // Fetch FIRST, while DSH is still running, so a network/remote failure
    // never takes the service down. Only once the fetch succeeds do we stop.
    stage = 'fetch'
    await run('git', ['-C', input.repoDir, '--no-pager', '-c', 'color.ui=false', 'fetch', 'origin', input.branch], input.repoDir, 120000)
    // The route has already returned 202; let the browser receive it before
    // the owning DSH process disappears.
    await sleep(2000)
    stage = 'stop-current-dsh'
    await stopCurrent()
    stopped = true
    stage = 'reset'
    await run('git', ['-C', input.repoDir, '--no-pager', '-c', 'color.ui=false', 'reset', '--hard', 'origin/' + input.branch], input.repoDir, 120000)
    stage = 'install'
    await run('pnpm', ['install', '--frozen-lockfile'], input.repoDir, 20 * 60 * 1000, { CI: 'true' })
    // The pnpm store keeps stale build output of the previous revision; clean
    // it (harness 'pnpm clean', which removes repository-owned build state but
    // preserves installed dependencies) so the build never picks up leftover
    // artifacts after the hard reset.
    stage = 'clean'
    await run('pnpm', ['clean'], input.repoDir, 30 * 60 * 1000)
    stage = 'build'
    await run('pnpm', ['build'], input.repoDir, 30 * 60 * 1000)
    success = true
    writeState({ ok: true, at: now(), from: input.oldHead, to: input.newHead })
    log('upgrade completed from ' + input.oldHead + ' to ' + input.newHead)
  } catch (error) {
    errorText = error instanceof Error ? error.message : String(error)
    log('upgrade failed during ' + stage + ': ' + errorText)
    if (stopped) {
      // DSH was stopped and the checkout may be partially updated. Restore the
      // known running revision AND its dependencies so the old service is not
      // launched against a partial tree. Any rollback error is logged but must
      // not prevent the restart attempt.
      try {
        await run('git', ['-C', input.repoDir, '--no-pager', '-c', 'color.ui=false', 'reset', '--hard', input.oldHead], input.repoDir, 120000)
        log('restored previous revision ' + input.oldHead)
      } catch (rollbackError) {
        log('rollback (reset) failed: ' + (rollbackError instanceof Error ? rollbackError.message : String(rollbackError)))
      }
      try {
        await run('pnpm', ['install', '--frozen-lockfile'], input.repoDir, 20 * 60 * 1000, { CI: 'true' })
        log('restored dependencies at previous revision')
      } catch (installError) {
        log('rollback (pnpm install) failed: ' + (installError instanceof Error ? installError.message : String(installError)))
      }
    }
    writeState({ ok: false, at: now(), from: input.oldHead || null, to: input.newHead || null, stage, error: errorText })
  } finally {
    if (stopped) {
      try {
        restart()
      } catch (restartError) {
        log('restart failed: ' + (restartError instanceof Error ? restartError.message : String(restartError)))
      }
    } else {
      // The failure happened before DSH was stopped (e.g. fetch failed); the
      // service is still running, so there is nothing to restart.
      log('aborted before stopping DSH; service left running')
    }
  }
  process.exit(success ? 0 : 1)
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  log('fatal runner error: ' + message)
  // An unexpected fatal error must never strand the GUI in the upgrading
  // state: clear the flag and record a failure so future upgrades are allowed.
  try {
    writeState({ ok: false, at: now(), from: input.oldHead || null, to: input.newHead || null, stage: 'fatal', error: message })
  } catch (stateError) {
    log('fatal state write failed: ' + (stateError instanceof Error ? stateError.message : String(stateError)))
  }
  process.exit(1)
})
`