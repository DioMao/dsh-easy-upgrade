import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GitUpdateStatus } from './git.js'

export interface UpgradeResult {
  ok: boolean
  at: string
  from: string | null
  to: string | null
  stage?: string
  error?: string
}

export interface UpgradeState {
  checkedAt: string | null
  status: GitUpdateStatus | null
  lastCheckError: string | null
  upgrading: boolean
  lastUpgrade: UpgradeResult | null
  /** Install shape the status consumed: 'source' when a checkout was matched (or configured); 'unknown'/'', see read(). */
  installKind: '' | 'source' | 'unknown'
  /** Matched deepseek-harness checkout root; null when unknown or unconfigured. */
  repoDir: string | null
}

export interface LaunchSpec {
  execPath: string
  args: string[]
  cwd: string
}

const EMPTY_STATE: UpgradeState = {
  checkedAt: null,
  status: null,
  lastCheckError: null,
  upgrading: false,
  lastUpgrade: null,
  installKind: '',
  repoDir: null,
}

/** Own all persistent data in one user-owned DSH_HOME subdirectory. */
export class StateStore {
  readonly statePath: string
  readonly launchPath: string
  readonly logPath: string
  readonly runnerPath: string

  constructor(readonly stateDir: string) {
    this.statePath = join(stateDir, 'state.json')
    this.launchPath = join(stateDir, 'launch.json')
    this.logPath = join(stateDir, 'upgrade.log')
    this.runnerPath = join(stateDir, 'upgrade-runner.mjs')
  }

  async ensure(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true })
  }

  async read(): Promise<UpgradeState> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as Partial<UpgradeState>
      return {
        checkedAt: typeof parsed.checkedAt === 'string' ? parsed.checkedAt : null,
        status: validStatus(parsed.status) ? parsed.status : null,
        lastCheckError: typeof parsed.lastCheckError === 'string' ? parsed.lastCheckError : null,
        upgrading: parsed.upgrading === true,
        lastUpgrade: validUpgradeResult(parsed.lastUpgrade) ? parsed.lastUpgrade : null,
        installKind: parsed.installKind === 'source' || parsed.installKind === 'unknown' ? parsed.installKind : '',
        repoDir: typeof parsed.repoDir === 'string' ? parsed.repoDir : null,
      }
    } catch {
      return { ...EMPTY_STATE }
    }
  }

  async write(state: UpgradeState): Promise<void> {
    await this.ensure()
    await atomicJson(this.statePath, state)
  }

  async writeLaunch(launch: LaunchSpec): Promise<void> {
    await this.ensure()
    await atomicJson(this.launchPath, launch)
  }

  /**
   * Bound `upgrade.log` to `maxBytes`. When the file grows past the cap, keep
   * only the most recent tail (plus a short marker) so the log never fills
   * disk — the restarted DSH service also writes its stdout/stderr here for
   * as long as it runs. Returns true when the file was trimmed.
   */
  async trimLog(maxBytes: number): Promise<boolean> {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) return false
    try {
      const { open } = await import('node:fs/promises')
      const fd = await open(this.logPath, 'r+')
      try {
        const size = (await fd.stat()).size
        if (size <= maxBytes) return false
        const keep = Math.min(Math.floor(maxBytes * 0.5), size)
        const tail = Buffer.allocUnsafe(keep)
        const { bytesRead } = await fd.read(tail, 0, keep, size - keep)
        const marker = Buffer.from(`[... upgrade.log trimmed: kept last ${bytesRead} of ${size} bytes ...]\n`)
        await fd.truncate(0)
        const head = Buffer.concat([marker, tail.subarray(0, bytesRead)])
        await fd.write(head, 0, head.length, 0)
        return true
      } finally {
        await fd.close()
      }
    } catch {
      return false
    }
  }

  async readLaunch(): Promise<LaunchSpec | null> {
    try {
      const parsed = JSON.parse(await readFile(this.launchPath, 'utf8')) as Partial<LaunchSpec>
      if (typeof parsed.execPath !== 'string' || typeof parsed.cwd !== 'string' || !Array.isArray(parsed.args)
        || !parsed.args.every(value => typeof value === 'string')) return null
      return { execPath: parsed.execPath, cwd: parsed.cwd, args: parsed.args }
    } catch {
      return null
    }
  }
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

function validStatus(value: unknown): value is GitUpdateStatus {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<GitUpdateStatus>
  return typeof candidate.localSha === 'string'
    && typeof candidate.remoteSha === 'string'
    && typeof candidate.ahead === 'number'
    && typeof candidate.behind === 'number'
    && typeof candidate.upToDate === 'boolean'
    && (candidate.localVersion === null || typeof candidate.localVersion === 'string')
    && (candidate.remoteVersion === null || typeof candidate.remoteVersion === 'string')
}

function validUpgradeResult(value: unknown): value is UpgradeResult {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<UpgradeResult>
  return typeof candidate.ok === 'boolean'
    && typeof candidate.at === 'string'
    && (candidate.from === null || typeof candidate.from === 'string')
    && (candidate.to === null || typeof candidate.to === 'string')
}