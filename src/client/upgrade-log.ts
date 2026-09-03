export type UpgradeLogLineKind = 'command' | 'error' | 'info' | 'success'

export interface UpgradeLogLine {
  timestamp: string | null
  text: string
  kind: UpgradeLogLineKind
}

const ANSI_CSI = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')
const TIMESTAMP_PREFIX = /^(\[[^\]\r\n]+\]\s*)(.*)$/
const ERROR_LINE = /(?:\b(?:error|failed|fatal)\b|ERR!|ERR_|exited with [1-9]\d*)/i
const SUCCESS_LINE = /^(?:stage:|upgrade completed\b|restarted DSH\b|rollback: (?:rebuilt|restored|cleaned))/i

export const DEFAULT_UPGRADE_LOG_MAX_LINES = 250
const MAX_UPGRADE_LOG_CHARS = 128 * 1024

/** Split runner output into safely renderable terminal-like text lines. */
export function classifyUpgradeLog(raw: string, maxLines = DEFAULT_UPGRADE_LOG_MAX_LINES): UpgradeLogLine[] {
  const visible = tailForDisplay(raw)
  if (visible === '') return []
  const body = visible.endsWith('\n') ? visible.slice(0, -1) : visible
  return body.split('\n').slice(-maxLines).map(rawLine => {
    const line = rawLine.replace(ANSI_CSI, '')
    const match = line.match(TIMESTAMP_PREFIX)
    const timestamp = match?.[1] ?? null
    const text = match?.[2] ?? line
    return { timestamp, text, kind: classifyLine(text) }
  })
}

function tailForDisplay(raw: string): string {
  if (raw.length <= MAX_UPGRADE_LOG_CHARS) return raw
  const tail = raw.slice(-MAX_UPGRADE_LOG_CHARS)
  const boundary = tail.indexOf('\n')
  return boundary === -1 ? tail : tail.slice(boundary + 1)
}

function classifyLine(text: string): UpgradeLogLineKind {
  if (text.startsWith('$ ')) return 'command'
  if (ERROR_LINE.test(text)) return 'error'
  if (SUCCESS_LINE.test(text)) return 'success'
  return 'info'
}
