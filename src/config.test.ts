import { afterEach, describe, expect, it, vi } from 'vitest'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveConfig } from './config.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveConfig', () => {
  it('applies safe defaults', () => {
    const config = resolveConfig(undefined)
    expect(config.repoDir).toBe('')
    expect(config.branch).toBe('master')
    expect(config.checkIntervalMs).toBe(60 * 60 * 1000)
    expect(config.retryCount).toBe(3)
    expect(config.retryDelayMs).toBe(5000)
    expect(config.logMaxBytes).toBe(15 * 1024 * 1024)
    expect(config.forceUpdateTest).toBe(false)
  })

  it('honors the forceUpdateTest development flag and ignores non-boolean values', () => {
    expect(resolveConfig({ forceUpdateTest: true }).forceUpdateTest).toBe(true)
    expect(resolveConfig({ forceUpdateTest: false }).forceUpdateTest).toBe(false)
    expect(resolveConfig({ forceUpdateTest: 'yes' }).forceUpdateTest).toBe(false)
    expect(resolveConfig({ forceUpdateTest: 1 }).forceUpdateTest).toBe(false)
  })

  it('defaults stateDir under DSH_HOME', () => {
    vi.stubEnv('DSH_HOME', join(tmpdir(), 'dsh-easy-upgrade-home'))
    const config = resolveConfig(undefined)
    expect(config.stateDir).toBe(join(join(tmpdir(), 'dsh-easy-upgrade-home'), 'dsh-easy-upgrade'))
  })

  it('defaults stateDir under the user home when DSH_HOME is unset', () => {
    vi.stubEnv('DSH_HOME', '')
    const config = resolveConfig(undefined)
    expect(config.stateDir).toBe(join(homedir(), '.dsh', 'dsh-easy-upgrade'))
  })

  it('honors explicit values', () => {
    const config = resolveConfig({
      repoDir: '/tmp/repo',
      branch: 'main',
      checkIntervalMs: 120000,
      retryCount: 1,
      retryDelayMs: 2000,
      logMaxBytes: 2 * 1024 * 1024,
      stateDir: '/tmp/state',
    })
    expect(config.repoDir).toBe('/tmp/repo')
    expect(config.branch).toBe('main')
    expect(config.checkIntervalMs).toBe(120000)
    expect(config.retryCount).toBe(1)
    expect(config.retryDelayMs).toBe(2000)
    expect(config.logMaxBytes).toBe(2 * 1024 * 1024)
    expect(config.stateDir).toBe('/tmp/state')
  })

  it('clamps out-of-range values and ignores blanks', () => {
    const config = resolveConfig({
      repoDir: '   ',
      checkIntervalMs: 10,
      retryCount: 99,
      retryDelayMs: 1,
      logMaxBytes: 100,
    })
    expect(config.repoDir).toBe('')
    expect(config.checkIntervalMs).toBe(60 * 60 * 1000)
    expect(config.retryCount).toBe(3)
    expect(config.retryDelayMs).toBe(5000)
    expect(config.logMaxBytes).toBe(15 * 1024 * 1024)
  })
})
