import { describe, expect, it } from 'vitest'
import { FOOTER_ACTION_LAYOUT_CSS } from './footer-action-layout.ts'

describe('footer-action-layout', () => {
  it('turns the footer-action slot wrapper into a full-width stacking column', () => {
    expect(FOOTER_ACTION_LAYOUT_CSS).toMatch(
      /\[data-slot=['"]sidebar\.footer\.action['"]\]\s*\{/,
    )
    expect(FOOTER_ACTION_LAYOUT_CSS).toMatch(/display:\s*flex\s*!important/)
    expect(FOOTER_ACTION_LAYOUT_CSS).toMatch(/flex-direction:\s*column/)
    expect(FOOTER_ACTION_LAYOUT_CSS).toMatch(/width:\s*100%\s*!important/)
  })
})
