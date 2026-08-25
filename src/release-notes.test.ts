import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseGithubRepo, fetchLatestRelease } from './release-notes.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseGithubRepo', () => {
  it('parses https GitHub remotes', () => {
    expect(parseGithubRepo('https://github.com/deepseek-ai/deepseek-harness.git'))
      .toEqual({ owner: 'deepseek-ai', repo: 'deepseek-harness' })
    expect(parseGithubRepo('https://github.com/owner/repo/'))
      .toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGithubRepo('https://www.github.com/owner/repo'))
      .toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses ssh and git-protocol remotes', () => {
    expect(parseGithubRepo('git@github.com:deepseek-ai/deepseek-harness.git'))
      .toEqual({ owner: 'deepseek-ai', repo: 'deepseek-harness' })
    expect(parseGithubRepo('ssh://git@github.com/owner/repo'))
      .toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGithubRepo('git://github.com/owner/repo.git'))
      .toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('rejects empty, non-github, and malformed remotes', () => {
    expect(parseGithubRepo('')).toBeNull()
    expect(parseGithubRepo('  ')).toBeNull()
    expect(parseGithubRepo('https://example.com/x/y.git')).toBeNull()
    expect(parseGithubRepo('github.com/owner/repo')).toBeNull()
    expect(parseGithubRepo('git@github.com:owner')).toBeNull()
  })
})

describe('fetchLatestRelease', () => {
  // A real git repo whose origin points at a github.com remote. Keeping this
  // repo's own origin makes the test deterministic without stubbing git.
  const repoDir = process.cwd()

  it('normalizes the newest release (skipping drafts)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { tag_name: 'v1.2.0', name: 'v1.2.0', body: 'notes', published_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/a/b/releases/tag/v1.2.0', draft: false },
    ]), { status: 200 })))
    const release = await fetchLatestRelease(repoDir)
    expect(fetch).toHaveBeenCalledOnce()
    expect(release).toEqual({
      tagName: 'v1.2.0', name: 'v1.2.0', body: 'notes',
      publishedAt: '2026-01-01T00:00:00Z',
      htmlUrl: 'https://github.com/a/b/releases/tag/v1.2.0',
    })
  })

  it('returns null when the newest release is a draft', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { tag_name: 'v1.2.0', name: 'v1.2.0', body: 'wip', published_at: null, html_url: null, draft: true },
    ]), { status: 200 })))
    expect(await fetchLatestRelease(repoDir)).toBeNull()
  })

  it('returns null on a non-OK API response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    expect(await fetchLatestRelease(repoDir)).toBeNull()
  })

  it('returns null for an unexpected (non-array) payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'nope' }), { status: 200 })))
    expect(await fetchLatestRelease(repoDir)).toBeNull()
  })

  it('returns null when the remote is not on github.com', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not be called') }))
    // A temp repo with a non-github origin exercises the early return.
    const { mkdtemp, writeFile, mkdir } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'dsh-upgrade-nongithub-'))
    try {
      await mkdir(join(dir, '.git'))
      await writeFile(join(dir, '.git', 'config'), '[remote "origin"]\n\turl = https://example.com/a/b.git\n')
      expect(await fetchLatestRelease(dir)).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      await (await import('node:fs/promises')).rm(dir, { recursive: true, force: true })
    }
  })
})
