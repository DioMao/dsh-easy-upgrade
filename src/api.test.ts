import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolveConfig } from './config.js'
import { UpgradeController, upgradeAllowed } from './api.js'
import { StateStore, type UpgradeState } from './state.js'

describe('upgradeAllowed', () => {
  it('requires a committed behind-count in normal mode', () => {
    expect(upgradeAllowed(0, false)).toBe(false)
    expect(upgradeAllowed(-1, false)).toBe(false)
    expect(upgradeAllowed(1, false)).toBe(true)
    expect(upgradeAllowed(5, false)).toBe(true)
  })

  it('always allows the full flow in development-forced mode', () => {
    expect(upgradeAllowed(0, true)).toBe(true)
    expect(upgradeAllowed(-1, true)).toBe(true)
    expect(upgradeAllowed(5, true)).toBe(true)
  })

  it('settles a successful post-restart recovery exactly once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-upgrade-api-'))
    try {
      const store = new StateStore(dir)
      const initial: UpgradeState = {
        checkedAt: '2026-01-01T00:00:00Z',
        status: {
          localVersion: '0.2.0', remoteVersion: '0.2.0', localSha: 'b'.repeat(40), remoteSha: 'b'.repeat(40),
          ahead: 0, behind: 0, upToDate: true,
        },
        lastCheckError: null,
        upgrading: true,
        lastUpgrade: { ok: true, at: '2026-01-01T00:00:01Z', from: 'a'.repeat(40), to: 'b'.repeat(40) },
        progress: null,
        installKind: 'source',
        repoDir: '/tmp/repo',
      }
      await store.write(initial)
      const controller = new UpgradeController(
        resolveConfig({ repoDir: '/tmp/repo', stateDir: dir }),
        store,
        { execPath: process.execPath, args: ['app.js'], cwd: dir },
        () => {},
      )

      await expect(controller.completeRestartRecovery()).resolves.toMatchObject({ upgrading: false, progress: null })
      await expect(controller.status()).resolves.toMatchObject({ upgrading: false, progress: null })
      await expect(store.read()).resolves.toMatchObject({ upgrading: false, progress: null })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})