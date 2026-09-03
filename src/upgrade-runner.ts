import { closeSync, openSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import type { UpgradeConfig } from './config.js'
import { UPGRADE_STAGE } from './progress.js'
import { platformKind, spawn, stopUpgradeTarget } from './proc.js'
import type { LaunchSpec, StateStore } from './state.js'

export interface UpgradeLaunch {
  repoDir: string
  branch: string
  oldHead: string
  newHead: string
  newVersion: string | null
  targetPid: number
  launch: LaunchSpec
}

/** Per-run options handed to the detached runner and exposed to the browser. */
export interface UpgradeOptions {
  /** Loopback port of the runner's live progress server; 0 disables it. */
  progressPort: number
  /** Random token the progress server demands on every request. */
  progressToken: string
  /** On failure after DSH is stopped, restore oldHead and rebuild fully. */
  rollbackOnFailure: boolean
}

/**
 * Reserve a free loopback port for the detached progress server. The port can
 * be taken between closing the probe and the runner binding it; the runner
 * degrades gracefully (no progress server) in that rare case.
 */
export async function pickLoopbackPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>(resolve => {
    server.close(() => resolve())
  })
  return port
}

/**
 * Start an independent Node process that waits for the HTTP response, stops the
 * current DSH process, resets to the checked remote revision, builds, and launches the
 * exact command captured when this plugin activated.
 */
export async function launchUpgradeRunner(
  store: StateStore,
  config: UpgradeConfig,
  launch: UpgradeLaunch,
  options: UpgradeOptions,
): Promise<void> {
  await store.ensure()
  await writeFile(store.runnerPath, RUNNER_SOURCE, { mode: 0o700 })
  const logFd = openSync(store.logPath, 'a', 0o600)
  try {
    // The stop action is decided here, in the (dependency-aware) host half,
    // and handed to the detached runner as plain JSON: Windows gets an
    // explicit taskkill /T /F while POSIX keeps the graceful signal sequence.
    const stop = stopUpgradeTarget(launch.targetPid, platformKind())
    const child = spawn(process.execPath, [store.runnerPath, JSON.stringify({
      ...launch,
      statePath: store.statePath,
      logPath: store.logPath,
      stop,
      config: { repoDir: config.repoDir, branch: config.branch, logMaxBytes: config.logMaxBytes },
      ...options,
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
export const RUNNER_SOURCE = String.raw`import { appendFileSync, closeSync, openSync, readFileSync, renameSync, statSync, truncateSync, readSync, writeFileSync, writeSync } from 'node:fs'
import { createServer } from 'node:http'
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

// Stage ids interpolated from src/progress.ts so the detached process reports
// exactly the ids the browser client knows how to label.
const STAGE = ${JSON.stringify(UPGRADE_STAGE)}

// Live progress state served by the loopback HTTP endpoint below. It exists
// only in memory: the runner dies with the server when the upgrade ends.
let currentPhase = 'upgrading'
let currentStage = null
const startedAt = now()
let finishedAt = null

const progressPort = Number.isInteger(input.progressPort) && input.progressPort > 0 ? input.progressPort : 0
const progressToken = typeof input.progressToken === 'string' ? input.progressToken : ''
const rollbackOnFailure = input.rollbackOnFailure === true

const setStage = (stage) => {
  currentStage = stage
  log('stage: ' + stage)
}

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

// Platform semantics decided by the host half (src/proc.ts) and passed over
// the wire: Windows asks for an explicit process-tree kill, POSIX relies on
// the graceful signal sequence below. Falls back to the old behavior when the
// field is absent (e.g. a runner written by an older plugin).
const stop = input.stop || { mode: 'signal' }

function progressTail() {
  let tail = ''
  try {
    if (!logPath) return tail
    const size = statSync(logPath).size
    const keep = Math.min(size, 64 * 1024)
    if (keep <= 0) return tail
    const fd = openSync(logPath, 'r')
    try {
      const buffer = Buffer.allocUnsafe(keep)
      const { bytesRead } = readSync(fd, buffer, 0, keep, size - keep)
      tail = buffer.subarray(0, bytesRead).toString('utf8')
    } finally { closeSync(fd) }
  } catch {}
  return tail
}

// Loopback-only live progress service: the browser page reads /progress and
// /log here while the DSH web server itself is stopped by the upgrade. A
// random per-run token gates every request; CORS lets the DSH origin page
// reach a different loopback port, and the private-network header covers
// older Chromium clients when the DSH web server is bound to all interfaces.
function startProgressServer() {
  if (!progressPort || !progressToken) return
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (url.searchParams.get('token') !== progressToken) {
      response.writeHead(403)
      response.end()
      return
    }
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-private-network': 'true',
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors)
      response.end()
      return
    }
    if (request.method !== 'GET') {
      response.writeHead(405)
      response.end()
      return
    }
    if (url.pathname === '/progress') {
      response.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        ok: true,
        progress: {
          phase: currentPhase,
          stage: currentStage,
          startedAt,
          finishedAt,
          from: input.oldHead || null,
          to: input.newHead || null,
        },
      }))
      return
    }
    if (url.pathname === '/log') {
      response.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: true, log: progressTail() }))
      return
    }
    response.writeHead(404)
    response.end()
  })
  server.on('error', (error) => {
    log('progress server failed: ' + (error && error.message ? error.message : String(error)))
  })
  server.listen(progressPort, '127.0.0.1', () => {
    log('progress server listening on 127.0.0.1:' + progressPort)
  })
}
startProgressServer()

// Spawn wrapper for the dependency-free runner. On Windows a bare command may
// be a .cmd/.bat shim (pnpm); CreateProcess cannot launch those directly, so
// shell mode routes them through cmd.exe and quotes arguments — the runner
// equivalent of the 'cross-spawn' used in the dependency-aware host half.
function spawnPlatform(command, args, options) {
  if (process.platform === 'win32') {
    const bare = !/[\\\\/]/.test(command) && !/\\.[A-Za-z0-9]+$/.test(command)
    if (bare) return spawn(command, args, { ...(options || {}), shell: true })
  }
  return spawn(command, args, options || {})
}

function completedStatus() {
  const version = typeof input.newVersion === 'string' ? input.newVersion : null
  return {
    localVersion: version,
    remoteVersion: version,
    localSha: input.newHead,
    remoteSha: input.newHead,
    ahead: 0,
    behind: 0,
    upToDate: true,
  }
}

function writeState(result, status, awaitingRecovery = false) {
  let previous = {}
  try { if (statePath) previous = JSON.parse(readFileSync(statePath, 'utf8')) } catch {}
  const state = {
    ...previous,
    ...(status ? { checkedAt: now(), status, lastCheckError: null } : {}),
    // A successful runner has rebuilt the checkout, but the replacement DSH
    // process must finish its first status check before the browser can leave
    // the progress surface without flashing an actionable update control.
    upgrading: awaitingRecovery,
    // The progress server address is per-run; never let a stale one survive.
    progress: null,
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
    const child = spawnPlatform(command, args, {
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
  if (stop.mode === 'taskkill' && process.platform === 'win32') {
    // Windows cannot deliver POSIX signals. The host decided on an explicit
    // process-tree kill (taskkill /T /F) so no child process keeps the
    // checkout or build output locked during the reset/install/rollback.
    log('terminating DSH process tree (taskkill /T /F) for pid ' + input.targetPid)
    await run(stop.command, stop.args, undefined, 30000)
    return
  }
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
    stage = STAGE.FETCH
    setStage(stage)
    await run('git', ['-C', input.repoDir, '--no-pager', '-c', 'color.ui=false', 'fetch', 'origin', input.branch], input.repoDir, 120000)
    // The route has already returned 202; let the browser receive it before
    // the owning DSH process disappears.
    await sleep(2000)
    stage = STAGE.STOP_CURRENT_DSH
    setStage(stage)
    await stopCurrent()
    stopped = true
    stage = STAGE.RESET
    setStage(stage)
    await run('git', ['-C', input.repoDir, '--no-pager', '-c', 'color.ui=false', 'reset', '--hard', input.newHead], input.repoDir, 120000)
    stage = STAGE.INSTALL
    setStage(stage)
    await run('pnpm', ['install', '--frozen-lockfile'], input.repoDir, 20 * 60 * 1000, { CI: 'true' })
    // The pnpm store keeps stale build output of the previous revision; clean
    // it (harness 'pnpm clean', which removes repository-owned build state but
    // preserves installed dependencies) so the build never picks up leftover
    // artifacts after the hard reset.
    stage = STAGE.CLEAN
    setStage(stage)
    await run('pnpm', ['clean'], input.repoDir, 30 * 60 * 1000)
    stage = STAGE.BUILD
    setStage(stage)
    await run('pnpm', ['build'], input.repoDir, 30 * 60 * 1000)
    success = true
    currentPhase = 'done'
    finishedAt = now()
    writeState({ ok: true, at: now(), from: input.oldHead, to: input.newHead }, completedStatus(), true)
    log('upgrade completed from ' + input.oldHead + ' to ' + input.newHead)
  } catch (error) {
    errorText = error instanceof Error ? error.message : String(error)
    currentPhase = 'failed'
    finishedAt = now()
    log('upgrade failed during ' + stage + ': ' + errorText)
    let rolledBack
    let rollbackStage
    if (stopped) {
      if (rollbackOnFailure) {
        // Full rollback: restore the known running revision and re-run the
        // entire build pipeline so the old service is launched from a
        // consistent tree. Any rollback error is logged but must never prevent
        // the restart attempt; rolledBack records whether every step succeeded.
        currentPhase = 'rollback'
        rolledBack = true
        const steps = [
          { stage: STAGE.ROLLBACK_RESET, command: 'git', args: ['-C', input.repoDir, '--no-pager', '-c', 'color.ui=false', 'reset', '--hard', input.oldHead], timeoutMs: 120000, okMessage: 'restored previous revision ' + input.oldHead },
          { stage: STAGE.ROLLBACK_INSTALL, command: 'pnpm', args: ['install', '--frozen-lockfile'], timeoutMs: 20 * 60 * 1000, okMessage: 'restored dependencies at previous revision' },
          { stage: STAGE.ROLLBACK_CLEAN, command: 'pnpm', args: ['clean'], timeoutMs: 30 * 60 * 1000, okMessage: 'cleaned build state at previous revision' },
          { stage: STAGE.ROLLBACK_BUILD, command: 'pnpm', args: ['build'], timeoutMs: 30 * 60 * 1000, okMessage: 'rebuilt previous revision' },
        ]
        for (const step of steps) {
          try {
            setStage(step.stage)
            await run(step.command, step.args, input.repoDir, step.timeoutMs, { CI: 'true' })
            log('rollback: ' + step.okMessage)
          } catch (rollbackError) {
            rolledBack = false
            rollbackStage = step.stage
            log('rollback (' + step.stage + ') failed: ' + (rollbackError instanceof Error ? rollbackError.message : String(rollbackError)))
          }
        }
      } else {
        // Light restore path (default): DSH was stopped and the checkout may be
        // partially updated. Restore the known running revision AND its
        // dependencies so the old service is not launched against a partial
        // tree. Any rollback error is logged but must not prevent the restart.
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
    }
    const result = { ok: false, at: now(), from: input.oldHead || null, to: input.newHead || null, stage, error: errorText }
    if (rolledBack !== undefined) {
      result.rolledBack = rolledBack
      result.rollbackStage = rollbackStage ?? null
    }
    writeState(result)
  } finally {
    if (stopped) {
      try {
        setStage(STAGE.RESTART)
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