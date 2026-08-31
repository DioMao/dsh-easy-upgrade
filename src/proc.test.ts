import { describe, expect, it } from 'vitest'
import { platformKind, stopUpgradeTarget, type PlatformKind } from './proc.js'

describe('platformKind', () => {
  it('maps win32 to windows', () => {
    expect(platformKind('win32')).toBe('windows')
  })

  it('maps darwin (macOS) to posix', () => {
    expect(platformKind('darwin')).toBe('posix')
  })

  it('maps linux and unknown platforms to posix', () => {
    expect(platformKind('linux')).toBe('posix')
    expect(platformKind('freebsd')).toBe('posix')
  })
})

describe('stopUpgradeTarget', () => {
  it('terminates the whole process tree on Windows (taskkill /T /F)', () => {
    const action = stopUpgradeTarget(4242, 'windows')
    expect(action.mode).toBe('taskkill')
    if (action.mode === 'taskkill') {
      expect(action.command).toBe('taskkill')
      expect(action.args).toEqual(['/PID', '4242', '/T', '/F'])
    }
  })

  it('keeps the graceful signal sequence on POSIX (Linux/macOS)', () => {
    for (const kind of ['posix'] as PlatformKind[]) {
      expect(stopUpgradeTarget(4242, kind)).toEqual({ mode: 'signal' })
    }
  })

  it('round-trips through the runner wire format', () => {
    // The host serializes the stop action into the detached runner input; the
    // runner only branches on mode, so both families must stay JSON-lossless.
    const action = stopUpgradeTarget(99, 'windows')
    const revived = JSON.parse(JSON.stringify(action))
    expect(revived).toEqual({ mode: 'taskkill', command: 'taskkill', args: ['/PID', '99', '/T', '/F'] })
    expect(JSON.parse(JSON.stringify(stopUpgradeTarget(99, 'posix')))).toEqual({ mode: 'signal' })
  })
})