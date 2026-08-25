import { describe, expect, it } from 'vitest'
import { inlineTokens, splitBlocks } from './notes-markdown.js'

describe('splitBlocks', () => {
  it('parses ATX headings with their levels', () => {
    const blocks = splitBlocks('# A\n## B\n### C\n#### D')
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'heading', 'heading', 'heading'])
    expect(blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'A' })
    expect(blocks[1]).toEqual({ kind: 'heading', level: 2, text: 'B' })
  })

  it('groups bullet and ordered lists', () => {
    const blocks = splitBlocks('- one\n- two\n\n1. first\n2. second')
    expect(blocks[0]).toEqual({ kind: 'list', items: ['one', 'two'] })
    expect(blocks[1]).toEqual({ kind: 'ordered', items: ['first', 'second'] })
  })

  it('collects fenced code blocks verbatim', () => {
    const blocks = splitBlocks('before\n```js\nconst a = `<x>`\n```\nafter')
    expect(blocks[1]).toEqual({ kind: 'code', text: 'const a = `<x>`' })
  })

  it('keeps inline HTML out of the output but preserves the prose', () => {
    const blocks = splitBlocks('<h3 id="cn-1">体验优化</h3>\n\n---\n\nplain')
    expect(blocks[0]).toEqual({ kind: 'paragraph', text: '体验优化' })
    expect(blocks[1]).toEqual({ kind: 'rule' })
    expect(blocks[2]).toEqual({ kind: 'paragraph', text: 'plain' })
  })

  it('joins soft-wrapped paragraph lines with a space', () => {
    const blocks = splitBlocks('first line\nsecond line')
    expect(blocks[0]).toEqual({ kind: 'paragraph', text: 'first line second line' })
  })
})

describe('inlineTokens', () => {
  it('tokenizes code, bold, links, and plain text', () => {
    expect(inlineTokens('use `npm i` or **now** at [docs](https://d.com)'))
      .toEqual([
        { type: 'text', text: 'use ' },
        { type: 'code', text: 'npm i' },
        { type: 'text', text: ' or ' },
        { type: 'bold', text: 'now' },
        { type: 'text', text: ' at ' },
        { type: 'link', label: 'docs', href: 'https://d.com' },
      ])
  })

  it('leaves unmatched text as-is', () => {
    expect(inlineTokens('just words')).toEqual([{ type: 'text', text: 'just words' }])
  })
})
