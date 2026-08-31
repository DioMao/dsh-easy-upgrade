import { describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pickLoopbackPort, RUNNER_SOURCE } from './upgrade-runner.js'

/**
 * End-to-end tests of the detached runner against a throwaway git repository.
 * POSIX only: the fake `pnpm` shim and PATH injection are Unix-shaped, and the
 * runner's restart child uses the test's own Node executable.
 */

describe.skipIf(process.platform === 'win32')('upgrade runner', () => {
  it('fully rolls back and rebuilds when rollbackOnFailure is set', { timeout: 90_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-runner-full-'))
    let target: ChildProcess | undefined
    try {
      const { repoDir, oldHead, newHead } = await makeRepo(dir)
      const fake = await setupFakePnpm(dir)
      target = spawnDummyChild()
      const port = await pickLoopbackPort()
      const statePath = join(dir, 'state.json')
      const logPath = join(dir, 'upgrade.log')
      const runnerPath = join(dir, 'runner.mjs')
      await writeFile(runnerPath, RUNNER_SOURCE, { mode: 0o700 })

      const child = spawn(process.execPath, [runnerPath, JSON.stringify({
        repoDir,
        branch: 'master',
        oldHead,
        newHead,
        targetPid: target.pid,
        statePath,
        logPath,
        stop: { mode: 'signal' },
        config: { repoDir, branch: 'master', logMaxBytes: 1024 * 1024 },
        progressPort: port,
        progressToken: 'test-token',
        rollbackOnFailure: true,
        launch: { execPath: process.execPath, args: ['-e', ''], cwd: dir },
      })], {
        env: { ...process.env, PATH: `${fake.binDir}:${process.env.PATH ?? ''}`, PWN_STORE: fake.store, PWN_BUILD_COUNT: fake.count },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      // Probe the live progress server while the upgrade runs: token gate, stage
      // and log payloads. Assertions stay loose to avoid timing flakes.
      const sample = await pollUntil(8000, async () => {
        try {
          const body = await fetch(`http://127.0.0.1:${port}/progress?token=test-token`)
          if (!body.ok) return null
          const gate = await fetch(`http://127.0.0.1:${port}/progress`)
          return {
            gateOk: gate.ok,
            progress: await body.json() as { ok: boolean, progress?: { stage: string | null, phase: string } },
          }
        } catch {
          return null
        }
      })
      expect(sample).not.toBeNull()
      expect(sample?.gateOk).toBe(false)
      expect(sample?.progress.ok).toBe(true)
      expect(sample?.progress.progress?.stage).toBeTruthy()

      const { code } = await waitClose(child)
      expect(code).toBe(1)

      // Source restored to the previous revision.
      const head = runGit(repoDir, ['rev-parse', 'HEAD']).trim()
      expect(head).toBe(oldHead)

      // Full rollback pipeline: upgrade install/clean/build, then a fresh
      // install/clean/build at the previous revision.
      const calls = (await readFile(fake.store, 'utf8')).trim().split('\n').filter(Boolean)
      expect(calls).toEqual([
        'pnpm install --frozen-lockfile',
        'pnpm clean',
        'pnpm build',
        'pnpm install --frozen-lockfile',
        'pnpm clean',
        'pnpm build',
      ])

      const state = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, unknown>
      expect(state.upgrading).toBe(false)
      expect(state.progress).toBeNull()
      const last = state.lastUpgrade as Record<string, unknown>
      expect(last.ok).toBe(false)
      expect(last.stage).toBe('build')
      expect(last.rolledBack).toBe(true)
      expect(last.rollbackStage).toBeNull()

      const log = await readFile(logPath, 'utf8')
      expect(log).toContain(`progress server listening on 127.0.0.1:${port}`)
      expect(log).toContain('rollback: rebuilt previous revision')
    } finally {
      if (target !== undefined) terminate(target)
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps the light restore path when rollbackOnFailure is unset', { timeout: 90_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-runner-light-'))
    let target: ChildProcess | undefined
    try {
      const { repoDir, oldHead, newHead } = await makeRepo(dir)
      const fake = await setupFakePnpm(dir)
      target = spawnDummyChild()
      const port = await pickLoopbackPort()
      const statePath = join(dir, 'state.json')
      const logPath = join(dir, 'upgrade.log')
      const runnerPath = join(dir, 'runner.mjs')
      await writeFile(runnerPath, RUNNER_SOURCE, { mode: 0o700 })

      const child = spawn(process.execPath, [runnerPath, JSON.stringify({
        repoDir,
        branch: 'master',
        oldHead,
        newHead,
        targetPid: target.pid,
        statePath,
        logPath,
        stop: { mode: 'signal' },
        config: { repoDir, branch: 'master', logMaxBytes: 1024 * 1024 },
        progressPort: port,
        progressToken: 'test-token',
        rollbackOnFailure: false,
        launch: { execPath: process.execPath, args: ['-e', ''], cwd: dir },
      })], {
        env: { ...process.env, PATH: `${fake.binDir}:${process.env.PATH ?? ''}`, PWN_STORE: fake.store, PWN_BUILD_COUNT: fake.count },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const { code } = await waitClose(child)
      expect(code).toBe(1)

      const head = runGit(repoDir, ['rev-parse', 'HEAD']).trim()
      expect(head).toBe(oldHead)

      // Only the upgrade pipeline plus the light reset+install restore.
      const calls = (await readFile(fake.store, 'utf8')).trim().split('\n').filter(Boolean)
      expect(calls).toEqual([
        'pnpm install --frozen-lockfile',
        'pnpm clean',
        'pnpm build',
        'pnpm install --frozen-lockfile',
      ])

      const state = JSON.parse(await readFile(statePath, 'utf8')) as { lastUpgrade: Record<string, unknown> }
      expect(state.lastUpgrade.ok).toBe(false)
      expect(state.lastUpgrade.rolledBack).toBeUndefined()
      expect(state.lastUpgrade.rollbackStage).toBeUndefined()
    } finally {
      if (target !== undefined) terminate(target)
      await rm(dir, { recursive: true, force: true })
    }
  })
})

/** Build a repo with origin/master at newHead and HEAD (worktree) at oldHead. */
async function makeRepo(dir: string): Promise<{ repoDir: string, oldHead: string, newHead: string }> {
  const repoDir = join(dir, 'repo')
  const remoteDir = join(dir, 'remote.git')
  await mkdir(repoDir, { recursive: true })
  runGit(repoDir, ['init', '-b', 'master'])
  runGit(repoDir, ['config', 'user.email', 'test@example.com'])
  runGit(repoDir, ['config', 'user.name', 'test'])
  await writeFile(join(repoDir, 'app.txt'), 'v1\n', 'utf8')
  runGit(repoDir, ['add', '.'])
  runGit(repoDir, ['commit', '-m', 'old'])
  const oldHead = runGit(repoDir, ['rev-parse', 'HEAD']).trim()
  await writeFile(join(repoDir, 'app.txt'), 'v2\n', 'utf8')
  runGit(repoDir, ['add', '.'])
  runGit(repoDir, ['commit', '-m', 'new'])
  const newHead = runGit(repoDir, ['rev-parse', 'HEAD']).trim()
  runGit(repoDir, ['init', '--bare', remoteDir])
  runGit(repoDir, ['remote', 'add', 'origin', remoteDir])
  runGit(repoDir, ['push', 'origin', 'master'])
  runGit(repoDir, ['reset', '--hard', oldHead])
  return { repoDir, oldHead, newHead }
}

/** Fake `pnpm` on PATH: records calls, sleeps on install, fails first build. */
async function setupFakePnpm(dir: string): Promise<{ binDir: string, store: string, count: string }> {
  const binDir = join(dir, 'bin')
  const store = join(dir, 'pnpm.log')
  const count = join(dir, 'build.count')
  await mkdir(binDir, { recursive: true })
  const script = [
    '#!/usr/bin/env sh',
    'echo "pnpm $*" >> "$PWN_STORE"',
    'case "$1" in',
    '  install)',
    '    sleep 1.2',
    '    ;;',
    '  clean)',
    '    sleep 0.1',
    '    ;;',
    '  build)',
    '    count=$(cat "$PWN_BUILD_COUNT" 2>/dev/null || echo 0)',
    '    count=$((count + 1))',
    '    echo "$count" > "$PWN_BUILD_COUNT"',
    '    sleep 0.1',
    '    if [ "$count" -eq 1 ]; then',
    '      echo "fake build failed" >&2',
    '      exit 7',
    '    fi',
    '    ;;',
    'esac',
    'exit 0',
  ].join('\n')
  await writeFile(join(binDir, 'pnpm'), `${script}\n`, { mode: 0o755 })
  return { binDir, store, count }
}

function spawnDummyChild(): ChildProcess {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e3)'], { stdio: 'ignore' })
}

function terminate(child: ChildProcess): void {
  try { child.kill('SIGKILL') } catch { /* already gone */ }
}

function waitClose(child: ChildProcess): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve({ code }))
  })
}

async function pollUntil<T>(timeoutMs: number, probe: () => Promise<T | null>): Promise<T | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value !== null) return value
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  return null
}

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr ?? '').trim() || String(result.status)}`)
  }
  return result.stdout ?? ''
}