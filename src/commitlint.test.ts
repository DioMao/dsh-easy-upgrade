import { describe, expect, it } from 'vitest'
import { validateCommitMessage } from '../.githooks/commitlint.mjs'

describe('validateCommitMessage', () => {
  it('accepts valid conventional commits', () => {
    for (const message of [
      'feat: add release notes dialog',
      'fix(api): handle null release',
      'chore(ci): bump runner timeout',
      'docs: update README',
      'feat!: drop legacy endpoint',
      'refactor(client): simplify modal\n\nExtract rendering helpers.',
    ]) {
      expect(validateCommitMessage(message).ok, message).toBe(true)
    }
  })

  it('accepts every allowed type', () => {
    const types = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test']
    for (const type of types) {
      expect(validateCommitMessage(`${type}: change something`).ok, type).toBe(true)
    }
  })

  it('rejects an empty message', () => {
    expect(validateCommitMessage('').ok).toBe(false)
    expect(validateCommitMessage('   ').ok).toBe(false)
  })

  it('rejects a missing header shape', () => {
    expect(validateCommitMessage('random text').errors[0]).toContain("'<type>(<scope>): <subject>'")
    expect(validateCommitMessage('just words here').ok).toBe(false)
  })

  it('rejects unknown types', () => {
    const { ok, errors } = validateCommitMessage('foo: something')
    expect(ok).toBe(false)
    expect(errors[0]).toContain("type 'foo' is not one of")
  })

  it('rejects trailing periods and uppercase subject starts', () => {
    expect(validateCommitMessage('feat: add thing.').ok).toBe(false)
    expect(validateCommitMessage('feat: Add thing').ok).toBe(false)
  })

  it('rejects an over-long subject', () => {
    const long = `feat: ${'a'.repeat(100)}`
    const { ok, errors } = validateCommitMessage(long)
    expect(ok).toBe(false)
    expect(errors.some((error) => error.includes('at most 72'))).toBe(true)
  })
})
