#!/usr/bin/env node
/**
 * Conventional Commits linter for dsh-easy-upgrade.
 *
 * Enforced format (see AGENTS.md → Commit conventions):
 *   <type>(<optional scope>)(<optional !>): <subject>
 *
 *   <optional body>
 *   <optional footer(s)>
 *
 * Standalone usage:
 *   node .githooks/commitlint.mjs [<message-file|->]
 *   - no argument: read `.git/COMMIT_EDITMSG`
 *   - `-`: read the message from stdin
 *   - a path: read the commit message from that file
 *
 * When run as a script it prints the violations (if any) and exits non-zero.
 * The pure validator is exported for unit testing.
 */

const TYPES = new Set([
  'build', 'chore', 'ci', 'docs', 'feat', 'fix',
  'perf', 'refactor', 'revert', 'style', 'test',
])

const MAX_SUBJECT = 72

/** type(scope)?(breaking)?: subject — scope excludes whitespace/parens. */
const HEADER = /^([a-z]+)(?:\(([^()\s]+)\))?(!)?:\s+(.+)$/

export function validateCommitMessage(message) {
  const errors = []
  const normalized = String(message ?? '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const headerLine = lines.find((line) => line.trim() !== '') ?? ''
  if (headerLine.trim() === '') {
    errors.push('commit message is empty; provide a Conventional Commits message')
    return { ok: false, errors }
  }
  const match = HEADER.exec(headerLine.trim())
  if (match === null) {
    errors.push("header must match '<type>(<scope>): <subject>'")
  } else {
    const type = match[1]
    if (!TYPES.has(type)) {
      errors.push(`type '${type}' is not one of: ${[...TYPES].sort().join(', ')}`)
    }
    const subject = match[4]
    if (subject.length > MAX_SUBJECT) {
      errors.push(`subject is ${subject.length} chars; keep it at most ${MAX_SUBJECT}`)
    }
    if (subject.endsWith('.')) errors.push('subject must not end with a period')
    if (/^[A-Z]/.test(subject)) errors.push('subject should not start with an uppercase letter')
  }
  return { ok: errors.length === 0, errors }
}

async function messageFromInput(arg) {
  if (arg === undefined) {
    // Default to the in-progress commit message at the repository root.
    const { readFile } = await import('node:fs/promises')
    const { join, resolve } = await import('node:path')
    const root = process.env.GIT_DIR || resolve('.git')
    return readFile(join(root, 'COMMIT_EDITMSG'), 'utf8')
  }
  if (arg === '-') {
    const stdin = process.stdin
    stdin.setEncoding('utf8')
    let body = ''
    for await (const chunk of stdin) body += chunk
    return body
  }
  const { readFile } = await import('node:fs/promises')
  return readFile(arg, 'utf8')
}

import { pathToFileURL } from 'node:url'

const isDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirect) {
  const arg = process.argv[2]
  try {
    const raw = await messageFromInput(arg)
    const result = validateCommitMessage(raw)
    if (!result.ok) {
      process.stderr.write('commitlint: commit message violates Conventional Commits:\n')
      for (const error of result.errors) process.stderr.write(`  - ${error}\n`)
      process.stderr.write('Expected: <type>(<scope>): <imperative subject>\n')
      process.exit(1)
    }
  } catch (error) {
    process.stderr.write(`commitlint: could not read commit message: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

export default validateCommitMessage
