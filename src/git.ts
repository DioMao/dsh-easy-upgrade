import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** A machine-readable failure while invoking git. */
export class GitCommandError extends Error {
  constructor(message: string, readonly command: readonly string[]) {
    super(message)
    this.name = 'GitCommandError'
  }
}

/** Result used by the sidebar and persisted API status. */
export interface GitUpdateStatus {
  localVersion: string | null
  remoteVersion: string | null
  localSha: string
  remoteSha: string
  ahead: number
  behind: number
  upToDate: boolean
}

function runGit(cwd: string, args: string[], timeoutMs = 30_000): Promise<string> {
  const command = ['-C', cwd, '--no-pager', '-c', 'color.ui=false', ...args]
  return new Promise((resolve, reject) => {
    const child = spawn('git', command, {
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      finish(() => reject(new GitCommandError(`git ${args[0] ?? ''} timed out after ${timeoutMs}ms`, args)))
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.once('error', error => {
      finish(() => reject(new GitCommandError(`cannot run git: ${error.message}`, args)))
    })
    child.once('close', code => {
      finish(() => {
        if (code === 0) resolve(stdout)
        else reject(new GitCommandError(stderr.trim() || `git exited with ${String(code)}`, args))
      })
    })
  })
}

/** Verify that the configured directory is a git working tree. */
export async function assertGitRepository(repoDir: string): Promise<void> {
  const inside = (await runGit(repoDir, ['rev-parse', '--is-inside-work-tree'])).trim()
  if (inside !== 'true') throw new GitCommandError('configured directory is not a git working tree', ['rev-parse', '--is-inside-work-tree'])
}

/** Return non-empty porcelain output when the worktree or index has changes. */
export async function worktreeIsClean(repoDir: string): Promise<boolean> {
  const porcelain = await runGit(repoDir, ['status', '--porcelain=v1', '--untracked-files=normal'])
  return porcelain.trim() === ''
}

/** Fetch only the configured remote branch; this does not alter the worktree. */
export async function fetchBranch(repoDir: string, branch: string): Promise<void> {
  await runGit(repoDir, ['fetch', '--quiet', 'origin', branch], 60_000)
}

async function packageVersion(repoDir: string): Promise<string | null> {
  try {
    const raw = await readFile(join(repoDir, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : null
  } catch {
    return null
  }
}

async function revisionPackageVersion(repoDir: string, revision: string): Promise<string | null> {
  try {
    const raw = await runGit(repoDir, ['show', `${revision}:package.json`])
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : null
  } catch {
    return null
  }
}

/** Read local/remote revision and divergence after a successful fetch. */
export async function inspectUpdate(repoDir: string, branch: string): Promise<GitUpdateStatus> {
  const remoteRef = `origin/${branch}`
  const [localSha, remoteSha, counts, localVersion, remoteVersion] = await Promise.all([
    runGit(repoDir, ['rev-parse', 'HEAD']),
    runGit(repoDir, ['rev-parse', remoteRef]),
    runGit(repoDir, ['rev-list', '--left-right', '--count', `HEAD...${remoteRef}`]),
    packageVersion(repoDir),
    revisionPackageVersion(repoDir, remoteRef),
  ])
  const [aheadRaw = '0', behindRaw = '0'] = counts.trim().split(/\s+/)
  const ahead = Number.parseInt(aheadRaw, 10) || 0
  const behind = Number.parseInt(behindRaw, 10) || 0
  return {
    localVersion,
    remoteVersion,
    localSha: localSha.trim(),
    remoteSha: remoteSha.trim(),
    ahead,
    behind,
    upToDate: behind === 0,
  }
}

/** Run the non-destructive comparison, updating origin/<branch> first. */
export async function checkForUpdate(repoDir: string, branch: string): Promise<GitUpdateStatus> {
  await assertGitRepository(repoDir)
  await fetchBranch(repoDir, branch)
  return inspectUpdate(repoDir, branch)
}

/** Current full commit hash; used as the rollback point for a detached upgrade. */
export async function currentHead(repoDir: string): Promise<string> {
  return (await runGit(repoDir, ['rev-parse', 'HEAD'])).trim()
}