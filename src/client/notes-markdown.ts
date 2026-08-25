/**
 * Pure (React-free) parsing for GitHub release bodies shown in the upgrade
 * confirmation dialog. Kept framework-agnostic so the unit tests run in a plain
 * Node vitest environment; `ReleaseNotes.tsx` renders the produced blocks and
 * inline tokens with React and the harness theme tokens.
 */

export type NotesBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'ordered'; items: string[] }
  | { kind: 'rule' }
  | { kind: 'paragraph'; text: string }

export type InlineToken =
  | { type: 'code'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'link'; label: string; href: string }
  | { type: 'text'; text: string }

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\))/g
const LINK_PATTERN = /^\[([^\]\n]+)\]\(([^)\n]+)\)$/
const HTML_TAG_PATTERN = /<[^>]*>/g

/**
 * Split a release body into display blocks. The full framework MarkdownText
 * pipeline (katex + incremental GFM parser + shiki) would cost hundreds of KB
 * in the sidebar bundle for a small dialog, so this covers the constructs
 * release notes actually use — ATX headings, bullet/ordered lists, fenced
 * code, horizontal rules — and degrades everything else to plain text.
 */
export function splitBlocks(text: string): NotesBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: NotesBlock[] = []
  let list: Extract<NotesBlock, { kind: 'list' | 'ordered' }> | null = null
  let code: string[] | null = null
  let paragraph: string[] = []

  const pushList = (): void => {
    if (list === null) return
    blocks.push(list)
    list = null
  }
  const pushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flush = (): void => {
    pushList()
    pushParagraph()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (code !== null) {
      if (line.startsWith('```')) {
        blocks.push({ kind: 'code', text: code.join('\n') })
        code = null
      } else {
        code.push(raw)
      }
      continue
    }
    if (line.startsWith('```')) {
      flush()
      code = []
      continue
    }
    // GitHub release bodies occasionally embed inline HTML (e.g. `<h3>` section
    // markers). Strip the tags so the surrounding prose reads cleanly instead of
    // surfacing raw markup; the bracket-link/inline-code forms above survive.
    const text = line.replace(HTML_TAG_PATTERN, '')
    const heading = /^(#{1,4})\s+(.+)$/.exec(text)
    if (heading !== null) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3 | 4, text: heading[2] })
      continue
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(text)) {
      flush()
      blocks.push({ kind: 'rule' })
      continue
    }
    const bullet = /^[-*]\s+(.+)$/.exec(text)
    if (bullet !== null) {
      pushParagraph()
      if (list === null || list.kind !== 'list') {
        pushList()
        list = { kind: 'list', items: [] }
      }
      list.items.push(bullet[1])
      continue
    }
    const ordered = /^\d+[.)]\s+(.+)$/.exec(text)
    if (ordered !== null) {
      pushParagraph()
      if (list === null || list.kind !== 'ordered') {
        pushList()
        list = { kind: 'ordered', items: [] }
      }
      list.items.push(ordered[1])
      continue
    }
    if (list !== null) pushList()
    if (text.trim() === '') {
      pushParagraph()
      continue
    }
    paragraph.push(text.startsWith('>') ? text.replace(/^>\s?/, '').trim() : text)
  }
  flush()
  if (code !== null) blocks.push({ kind: 'code', text: code.join('\n') })
  return blocks
}

/** Tokenize inline formatting: `code`, **bold**, and [label](url). */
export function inlineTokens(text: string): InlineToken[] {
  const parts = text.split(INLINE_PATTERN)
  const tokens: InlineToken[] = []
  for (const part of parts) {
    if (part === '') continue
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      tokens.push({ type: 'code', text: part.slice(1, -1) })
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      tokens.push({ type: 'bold', text: part.slice(2, -2) })
    } else {
      const link = LINK_PATTERN.exec(part)
      if (link !== null) {
        tokens.push({ type: 'link', label: link[1], href: link[2] })
      } else {
        tokens.push({ type: 'text', text: part })
      }
    }
  }
  return tokens
}