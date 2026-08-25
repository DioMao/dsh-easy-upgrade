import { useMemo } from 'react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { InlineToken, NotesBlock } from './notes-markdown.ts'
import { inlineTokens, splitBlocks } from './notes-markdown.ts'
import css from './upgrade.module.css'

/**
 * Render one GitHub release body into the theme-styled notes surface. Parsing
 * lives in `notes-markdown.ts` (pure, unit-tested); this file only maps blocks
 * and inline tokens onto React elements with the harness theme tokens.
 */

function renderTokens(tokens: InlineToken[], keyBase: string): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyBase}-${index}`
    switch (token.type) {
      case 'code':
        return createElement('code', { key }, token.text)
      case 'bold':
        return createElement('strong', { key }, token.text)
      case 'link':
        return createElement('a', { key, href: token.href, target: '_blank', rel: 'noreferrer' }, token.label)
      case 'text':
        return token.text
    }
  })
}

function BlockView({ block }: { block: NotesBlock }): ReactNode {
  switch (block.kind) {
    case 'heading':
      return createElement(`h${block.level}`, null, renderTokens(inlineTokens(block.text), 'h'))
    case 'code':
      return createElement('pre', null, createElement('code', null, block.text))
    case 'list':
      return createElement('ul', null,
        block.items.map((item, index) => createElement('li', { key: index }, renderTokens(inlineTokens(item), `li-${index}`))))
    case 'ordered':
      return createElement('ol', null,
        block.items.map((item, index) => createElement('li', { key: index }, renderTokens(inlineTokens(item), `ol-${index}`))))
    case 'rule':
      return createElement('hr', null)
    case 'paragraph':
      return createElement('p', null, renderTokens(inlineTokens(block.text), 'p'))
  }
}

/** Render one GitHub release body into the theme-styled notes surface. */
export function ReleaseNotes({ text }: { text: string }): ReactNode {
  const blocks = useMemo(() => splitBlocks(text), [text])
  return createElement('div', { className: css.notes },
    blocks.map((block, index) => createElement(BlockView, { key: index, block })))
}