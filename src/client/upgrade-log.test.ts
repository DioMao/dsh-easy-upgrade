import { describe, expect, it } from 'vitest'
import { classifyUpgradeLog } from './upgrade-log.js'

describe('classifyUpgradeLog', () => {
  it('separates timestamped runner commands from their neutral timestamp', () => {
    expect(classifyUpgradeLog('[2026-09-03T10:00:00.000Z] $ git fetch origin master\n')).toEqual([
      { timestamp: '[2026-09-03T10:00:00.000Z] ', text: '$ git fetch origin master', kind: 'command' },
    ])
  })

  it('colors stable success and failure markers without reinterpreting ordinary output', () => {
    expect(classifyUpgradeLog([
      '[2026-09-03T10:00:01.000Z] stage: build',
      '[2026-09-03T10:00:02.000Z] upgrade completed from old to new',
      '\u001B[31mERR_PNPM_BUILD_FAILED\u001B[0m',
      'plain package output',
    ].join('\n'))).toEqual([
      { timestamp: '[2026-09-03T10:00:01.000Z] ', text: 'stage: build', kind: 'success' },
      { timestamp: '[2026-09-03T10:00:02.000Z] ', text: 'upgrade completed from old to new', kind: 'success' },
      { timestamp: null, text: 'ERR_PNPM_BUILD_FAILED', kind: 'error' },
      { timestamp: null, text: 'plain package output', kind: 'info' },
    ])
  })

  it('preserves blank and unmatched text while removing common ANSI CSI escapes', () => {
    expect(classifyUpgradeLog('first\n\n\u001B[2Ksecond')).toEqual([
      { timestamp: null, text: 'first', kind: 'info' },
      { timestamp: null, text: '', kind: 'info' },
      { timestamp: null, text: 'second', kind: 'info' },
    ])
  })

  it('keeps only the newest requested display lines', () => {
    const raw = Array.from({ length: 6 }, (_, index) => `line-${index + 1}`).join('\n')
    expect(classifyUpgradeLog(raw, 3).map(line => line.text)).toEqual(['line-4', 'line-5', 'line-6'])
  })

  it('does not render an extra terminal line for a trailing newline', () => {
    expect(classifyUpgradeLog('one\n')).toEqual([
      { timestamp: null, text: 'one', kind: 'info' },
    ])
    expect(classifyUpgradeLog('')).toEqual([])
  })
})
