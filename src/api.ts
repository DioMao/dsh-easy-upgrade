import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { UpgradeConfig } from './config.js'
import { checkForUpdate, currentHead, worktreeIsClean } from './git.js'
import { fetchLatestRelease, type GithubRelease } from './release-notes.js'
import type { LaunchSpec, StateStore, UpgradeState } from './state.js'
import { awaitingHostRecovery } from './state.js'
import { launchUpgradeRunner, pickLoopbackPort } from './upgrade-runner.js'

export interface UpgradeApiController {
  status(): Promise<UpgradeState>
  check(): Promise<UpgradeState>
  beginUpgrade(options?: { rollbackOnFailure?: boolean }): Promise<void>
  tailLog(): Promise<string>
  fetchRelease(): Promise<GithubRelease | null>
  /** Mirror of the row config so the browser can show the development-mode entry. */
  forceUpdateTest: boolean
}

/** An upgrade is allowed when behind the remote, or in development-forced mode. */
export function upgradeAllowed(behind: number, forceUpdateTest: boolean): boolean {
  return behind > 0 || forceUpdateTest
}

/** Keep all request behavior serializable, leaving Cordis wiring in index.ts. */
export class UpgradeController implements UpgradeApiController {
  private current: UpgradeState | undefined
  private checkInFlight: Promise<UpgradeState> | undefined
  private install: { kind: UpgradeState['installKind']; repoDir: string | null }

  constructor(
    private readonly config: UpgradeConfig,
    private readonly store: StateStore,
    private readonly launch: LaunchSpec,
    private readonly log: (message: string) => void,
  ) {
    // An explicitly configured checkout counts as a source install from boot.
    this.install = { kind: config.repoDir === '' ? '' : 'source', repoDir: config.repoDir || null }
  }

  /** Report the install shape resolved at boot (see src/index.ts detection). */
  setInstall(kind: UpgradeState['installKind'], repoDir: string | null): void {
    this.install = { kind, repoDir }
  }

  /** Development-only escape hatch; see UpgradeConfig.forceUpdateTest. */
  get forceUpdateTest(): boolean {
    return this.config.forceUpdateTest
  }

  async status(): Promise<UpgradeState> {
    if (this.current === undefined) this.current = await this.store.read()
    return this.current
  }

  async completeRestartRecovery(): Promise<UpgradeState> {
    const previous = await this.status()
    if (!awaitingHostRecovery(previous)) return previous
    const next: UpgradeState = { ...previous, upgrading: false, progress: null }
    await this.store.write(next)
    this.current = next
    return next
  }

  async check(): Promise<UpgradeState> {
    if (this.checkInFlight !== undefined) return this.checkInFlight
    this.checkInFlight = this.runCheck()
    try {
      return await this.checkInFlight
    } finally {
      this.checkInFlight = undefined
    }
  }

  private async runCheck(): Promise<UpgradeState> {
    const previous = await this.status()
    if (this.config.repoDir === '') {
      // No checkout to compare against (boot detection found none and the row
      // did not configure one). This is a permanent configuration gap, not a
      // transient git/network failure, so no retry is attempted.
      const message = '未能匹配 DSH 源码仓库：无法从当前 dsh 启动命令定位 deepseek-harness 源码目录。请在 cordis.patch.yml 的 dsh-easy-upgrade 行配置 repoDir，或从源码目录启动 dsh。'
      const next: UpgradeState = {
        ...previous,
        checkedAt: new Date().toISOString(),
        status: null,
        lastCheckError: message,
        installKind: this.install.kind,
        repoDir: this.install.repoDir,
      }
      await this.store.write(next)
      this.current = next
      throw new UpgradeApiError(409, 'no-repo', message)
    }
    let finalError: Error | undefined
    for (let attempt = 0; attempt <= this.config.retryCount; attempt += 1) {
      try {
        const status = await checkForUpdate(this.config.repoDir, this.config.branch)
        const next: UpgradeState = {
          ...previous,
          checkedAt: new Date().toISOString(),
          status,
          lastCheckError: null,
          installKind: this.install.kind,
          repoDir: this.install.repoDir,
        }
        await this.store.write(next)
        this.current = next
        return next
      } catch (error) {
        finalError = error instanceof Error ? error : new Error(String(error))
        if (attempt < this.config.retryCount) await delay(this.config.retryDelayMs)
      }
    }
    const next: UpgradeState = {
      ...previous,
      checkedAt: new Date().toISOString(),
      lastCheckError: finalError?.message ?? 'update check failed',
      installKind: this.install.kind,
      repoDir: this.install.repoDir,
    }
    await this.store.write(next)
    this.current = next
    throw finalError ?? new Error(next.lastCheckError ?? 'update check failed')
  }

  async beginUpgrade(options?: { rollbackOnFailure?: boolean }): Promise<void> {
    if (this.config.repoDir === '') {
      throw new UpgradeApiError(409, 'no-repo', '未能匹配 DSH 源码仓库，无法升级。请显式配置 repoDir 或从源码目录启动 dsh。')
    }
    const existing = await this.status()
    if (existing.upgrading) throw new UpgradeApiError(409, 'upgrade-in-progress', '升级任务已在进行中')
    if (!(await worktreeIsClean(this.config.repoDir))) {
      throw new UpgradeApiError(409, 'dirty-worktree', '工作区存在未提交改动；为避免丢失本地工作，已取消升级。')
    }
    const checked = await this.check()
    const remote = checked.status
    if (remote === null) {
      throw new UpgradeApiError(409, 'no-check-result', '更新检查没有可用结果，无法升级。')
    }
    if (!upgradeAllowed(remote.behind, this.config.forceUpdateTest)) {
      throw new UpgradeApiError(409, 'up-to-date', '当前已是远程主分支的最新版本。')
    }
    const oldHead = await currentHead(this.config.repoDir)
    // A live log belongs to exactly one accepted upgrade. Capacity trimming is
    // retained for maintenance paths, but cannot define a new-run boundary.
    await this.store.resetLog()
    // Reserve the detached progress server's loopback port and token here, in
    // the still-alive host, so the browser can learn the address from /status
    // before the runner stops this process.
    const port = await pickLoopbackPort()
    const token = randomBytes(24).toString('hex')
    const next: UpgradeState = {
      ...checked,
      upgrading: true,
      progress: { port, token, startedAt: new Date().toISOString() },
      lastCheckError: null,
    }
    await this.store.write(next)
    this.current = next
    try {
      await launchUpgradeRunner(this.store, this.config, {
        repoDir: this.config.repoDir,
        branch: this.config.branch,
        oldHead,
        newHead: remote.remoteSha,
        newVersion: remote.remoteVersion,
        targetPid: process.pid,
        launch: this.launch,
      }, {
        progressPort: port,
        progressToken: token,
        rollbackOnFailure: options?.rollbackOnFailure === true,
      })
    } catch (error) {
      const failed: UpgradeState = { ...next, upgrading: false, progress: null, lastCheckError: error instanceof Error ? error.message : String(error) }
      await this.store.write(failed)
      this.current = failed
      throw error
    }
    this.log(`detached upgrade runner started: ${oldHead.slice(0, 12)} -> ${remote.remoteSha.slice(0, 12)}`)
  }

  async tailLog(): Promise<string> {
    try {
      const { readFile } = await import('node:fs/promises')
      const raw = await readFile(this.store.logPath, 'utf8')
      return raw.length > 64 * 1024 ? raw.slice(-64 * 1024) : raw
    } catch {
      return ''
    }
  }

  /**
   * Best-effort latest GitHub release for the tracked checkout. Returns null
   * when no checkout is configured or the notes cannot be obtained; the client
   * confirmation dialog degrades to its generic copy in that case.
   */
  async fetchRelease(): Promise<GithubRelease | null> {
    if (this.config.repoDir === '') return null
    return fetchLatestRelease(this.config.repoDir)
  }
}

/** Register a single trusted prefix handler around an UpgradeApiController. */
export function createApiHandler(
  controller: UpgradeApiController,
  trusted: (request: IncomingMessage) => boolean,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (!trusted(request)) {
      writeJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
      return
    }
    const pathname = new URL(request.url ?? '/', 'http://dsh.internal').pathname
    const route = pathname.startsWith('/dsh-upgrade/api/') ? pathname.slice('/dsh-upgrade/api/'.length) : ''
    try {
      if (route === 'status' && request.method === 'GET') {
        writeJson(response, 200, { ok: true, state: await controller.status(), forceUpdateTest: controller.forceUpdateTest })
        return
      }
      if (route === 'check' && request.method === 'POST') {
        writeJson(response, 200, { ok: true, state: await controller.check(), forceUpdateTest: controller.forceUpdateTest })
        return
      }
      if (route === 'release' && request.method === 'GET') {
        writeJson(response, 200, { ok: true, release: await controller.fetchRelease() })
        return
      }
      if (route === 'upgrade' && request.method === 'POST') {
        const raw = await readBody(request, 16 * 1024)
        let rollbackOnFailure = false
        if (raw.trim() !== '') {
          let parsed: { rollbackOnFailure?: unknown }
          try {
            parsed = JSON.parse(raw) as { rollbackOnFailure?: unknown }
          } catch {
            throw new UpgradeApiError(400, 'bad-body', 'upgrade request body must be JSON')
          }
          if (typeof parsed.rollbackOnFailure === 'boolean') rollbackOnFailure = parsed.rollbackOnFailure
        }
        await controller.beginUpgrade({ rollbackOnFailure })
        writeJson(response, 202, { ok: true, started: true })
        return
      }
      if (route === 'log' && request.method === 'GET') {
        writeJson(response, 200, { ok: true, log: await controller.tailLog() })
        return
      }
      throw new UpgradeApiError(404, 'not-found', 'unknown upgrade API route')
    } catch (error) {
      const known = error instanceof UpgradeApiError
        ? error
        : new UpgradeApiError(500, 'internal', error instanceof Error ? error.message : String(error))
      writeJson(response, known.status, { ok: false, error: { code: known.code, message: known.message } })
    }
  }
}

export class UpgradeApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'UpgradeApiError'
  }
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/** Read a request body, bounded so a malformed client cannot exhaust memory. */
async function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buffer.length
    if (size > maxBytes) throw new UpgradeApiError(413, 'payload-too-large', 'request body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}