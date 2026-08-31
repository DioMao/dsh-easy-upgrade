import { describe, expect, it } from 'vitest'
import { upgradeAllowed } from './api.js'

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
})