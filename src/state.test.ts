import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { StateStore } from './state.js'
import type { GitUpdateStatus } from './git.js'

async function tempStore(): Promise<{ store: StateStore, dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-upgrade-state-'))
  return { store: new StateStore(dir), dir }
}

const status: GitUpdateStatus = {
  localVersion: '0.1.0',
  remoteVersion: '0.2.0',
  localSha: 'a'.repeat(40),
  remoteSha: 'b'.repeat(40),
  ahead: 2,
  behind: 5,
  upToDate: false,
}

describe('StateStore', () => {
  it('returns empty state when no file exists', async () => {
    const { store, dir } = await tempStore()
    try {
      const state = await store.read()
      expect(state.checkedAt).toBeNull()
      expect(state.status).toBeNull()
      expect(state.upgrading).toBe(false)
      expect(state.installKind).toBe('')
      expect(state.repoDir).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('round-trips state through write/read', async () => {
    const { store, dir } = await tempStore()
    try {
      await store.write({ checkedAt: '2026-01-01T00:00:00Z', status, lastCheckError: null, upgrading: true, lastUpgrade: null, installKind: 'source', repoDir: '/tmp/repo' })
      const state = await store.read()
      expect(state.checkedAt).toBe('2026-01-01T00:00:00Z')
      expect(state.status?.behind).toBe(5)
      expect(state.status?.ahead).toBe(2)
      expect(state.upgrading).toBe(true)
      expect(state.installKind).toBe('source')
      expect(state.repoDir).toBe('/tmp/repo')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('treats malformed JSON as empty state', async () => {
    const { store, dir } = await tempStore()
    try {
      await writeFile(join(dir, 'state.json'), 'not json', 'utf8')
      const state = await store.read()
      expect(state.checkedAt).toBeNull()
      expect(state.status).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('drops a structurally invalid persisted status', async () => {
    const { store, dir } = await tempStore()
    try {
      await writeFile(join(dir, 'state.json'), JSON.stringify({ status: { localSha: 'x' }, installKind: 'bogus' }), 'utf8')
      const state = await store.read()
      expect(state.status).toBeNull()
      expect(state.installKind).toBe('')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('round-trips per-run progress and rollback result fields', async () => {
    const { store, dir } = await tempStore()
    try {
      await store.write({
        checkedAt: '2026-01-01T00:00:00Z',
        status,
        lastCheckError: null,
        upgrading: true,
        lastUpgrade: null,
        progress: { port: 43210, token: 'abc123', startedAt: '2026-01-01T00:00:01Z' },
        installKind: 'source',
        repoDir: '/tmp/repo',
      })
      const inFlight = await store.read()
      expect(inFlight.upgrading).toBe(true)
      expect(inFlight.progress).toEqual({ port: 43210, token: 'abc123', startedAt: '2026-01-01T00:00:01Z' })
      await store.write({
        ...inFlight,
        upgrading: false,
        progress: null,
        lastUpgrade: { ok: false, at: '2026-01-01T00:05:00Z', from: 'a'.repeat(40), to: 'b'.repeat(40), stage: 'build', error: 'boom', rolledBack: true, rollbackStage: null },
      })
      const settled = await store.read()
      expect(settled.upgrading).toBe(false)
      expect(settled.progress).toBeNull()
      expect(settled.lastUpgrade?.rolledBack).toBe(true)
      expect(settled.lastUpgrade?.rollbackStage).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('drops a malformed persisted progress address', async () => {
    const { store, dir } = await tempStore()
    try {
      await writeFile(join(dir, 'state.json'), JSON.stringify({ upgrading: true, progress: { port: 'nope', token: '' } }), 'utf8')
      const state = await store.read()
      expect(state.upgrading).toBe(true)
      expect(state.progress).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('trims an over-cap log and returns true', async () => {
    const { store, dir } = await tempStore()
    try {
      const big = 'x'.repeat(1000)
      await writeFile(join(dir, 'upgrade.log'), big, 'utf8')
      const trimmed = await store.trimLog(500)
      expect(trimmed).toBe(true)
      const { readFile } = await import('node:fs/promises')
      const kept = await readFile(join(dir, 'upgrade.log'), 'utf8')
      expect(kept.length).toBeLessThan(500)
      expect(kept).toContain('trimmed')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not trim a log within the cap', async () => {
    const { store, dir } = await tempStore()
    try {
      await writeFile(join(dir, 'upgrade.log'), 'short', 'utf8')
      expect(await store.trimLog(500)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('round-trips launch specs and returns null on missing/malformed', async () => {
    const { store, dir } = await tempStore()
    try {
      expect(await store.readLaunch()).toBeNull()
      await store.writeLaunch({ execPath: '/usr/bin/node', args: ['--flag', 'app.js'], cwd: '/tmp' })
      const launch = await store.readLaunch()
      expect(launch).toEqual({ execPath: '/usr/bin/node', args: ['--flag', 'app.js'], cwd: '/tmp' })
      // Corrupt the stored value and expect a null read.
      await rm(join(dir, 'launch.json'), { force: true })
      await writeFile(join(dir, 'launch.json'), '{"execPath": 5}', 'utf8')
      expect(await store.readLaunch()).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
