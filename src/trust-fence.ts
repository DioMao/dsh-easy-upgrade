import type { IncomingHttpHeaders } from 'node:http'

/** Structural request subset used by the same-origin fence. */
interface RequestLike {
  headers: IncomingHttpHeaders
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(value: string): URL | undefined {
  try {
    return new URL(`http://${value}`)
  } catch {
    return undefined
  }
}

function isLoopback(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  const pieces = hostname.split('.')
  return pieces.length === 4
    && pieces[0] === '127'
    && pieces.every(piece => /^\d{1,3}$/.test(piece) && Number(piece) <= 255)
}

function trustedAuthority(host: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const candidate = parseAuthority(entry)
    if (candidate === undefined) return false
    if (candidate.port === '') return candidate.hostname === host.hostname
    return candidate.host === host.host
  })
}

/** Reject cross-site requests and authorities the web server was not configured to serve. */
export function isTrustedApiRequest(request: RequestLike, trustedHosts: readonly string[]): boolean {
  const hostValue = header(request.headers, 'host')
  if (hostValue === undefined) return false
  const host = parseAuthority(hostValue)
  if (host === undefined) return false
  if (!isLoopback(host.hostname) && !trustedAuthority(host, trustedHosts)) return false
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === host.host
  } catch {
    return false
  }
}