import { originRemoteUrl } from './git.js'

/**
 * Latest GitHub release summary shown inside the upgrade confirmation dialog.
 * Every field is nullable-safe: the dialog degrades gracefully when GitHub is
 * unreachable, the repo is not hosted on github.com, or the release carries no
 * notes.
 */
export interface GithubRelease {
  tagName: string
  name: string | null
  body: string | null
  publishedAt: string | null
  htmlUrl: string | null
}

const GITHUB_API = 'https://api.github.com'
const FETCH_TIMEOUT_MS = 8000
const USER_AGENT = 'dsh-easy-upgrade/0.2 (+https://github.com/deepseek-ai/deepseek-harness)'

/** Parse `owner/repo` out of any common git remote form for github.com. */
export function parseGithubRepo(remoteUrl: string): { owner: string, repo: string } | null {
  const url = remoteUrl.trim()
  if (url === '') return null
  // https://github.com/owner/repo.git  |  git@github.com:owner/repo.git
  // git://github.com/owner/repo        |  ssh://git@github.com/owner/repo.git
  let match: RegExpMatchArray | null = url
    .match(/^(?:https?|git|ssh):\/\/(?:[^/@]+@)?(?:www\.)?github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (match !== null) return { owner: match[1], repo: match[2] }
  match = url.match(/^(?:[^@/]+@)?github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (match !== null) return { owner: match[1], repo: match[2] }
  return null
}

/**
 * Fetch the newest GitHub release (including prereleases, excluding drafts) for
 * the checkout's origin repository and return its notes. The endpoint is
 * `releases?per_page=1` rather than `releases/latest`: this project publishes
 * its -rc tags as GitHub prereleases, so the formal "latest" endpoint returns
 * 404 while the newest (and only) release is exactly what an upgrade targets.
 * Returns null on ANY failure — network, timeout, non-github remote, unexpected
 * shape — because release notes are decorative context for a confirmation
 * dialog, never a hard dependency of the upgrade.
 */
export async function fetchLatestRelease(repoDir: string): Promise<GithubRelease | null> {
  let remoteUrl: string
  try {
    remoteUrl = await originRemoteUrl(repoDir)
  } catch {
    return null
  }
  const repo = parseGithubRepo(remoteUrl)
  if (repo === null) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${repo.owner}/${repo.repo}/releases?per_page=1`,
      {
        signal: controller.signal,
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': USER_AGENT,
        },
      },
    )
    if (!response.ok) return null
    const payload = await response.json() as unknown
    if (!Array.isArray(payload) || payload.length === 0) return null
    const first = payload[0] as {
      tag_name?: unknown
      name?: unknown
      body?: unknown
      published_at?: unknown
      html_url?: unknown
      draft?: unknown
    }
    // `per_page=1` is newest-first, but never surface a draft as "the"
    // release; fall back to nothing rather than a misleading entry.
    if (first.draft === true) return null
    if (typeof first.tag_name !== 'string' || first.tag_name === '') return null
    return {
      tagName: first.tag_name,
      name: typeof first.name === 'string' && first.name !== '' ? first.name : null,
      body: typeof first.body === 'string' && first.body !== '' ? first.body : null,
      publishedAt: typeof first.published_at === 'string' ? first.published_at : null,
      htmlUrl: typeof first.html_url === 'string' ? first.html_url : null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}