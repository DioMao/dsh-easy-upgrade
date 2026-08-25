/**
 * Sidebar footer-action layout shim.
 *
 * The shell renders every `sidebar.footer.action` occupant into one row-flex
 * container whose slot wrapper is `display: contents`. A second registered
 * action (e.g. ui-cordis's "Cordis Plugin" panel) therefore squeezes this
 * plugin's full-width version row to a sliver, and the 56px rail cannot hold
 * two 36px controls side by side. Until the shell itself stacks list-slot
 * occupants, this plugin restores the stacking by making the slot wrapper a
 * full-width column — the same `ctx.effect` style-tag convention ui-theme
 * uses. With a single occupant the rule is inert.
 */
export const FOOTER_ACTION_LAYOUT_CSS = `
/* dsh-easy-upgrade: sidebar footer action list — keep every occupant
   (Cordis panel, upgrade cell, …) on its own row instead of the shell's
   row flex squeezing them side by side. */
[data-slot='sidebar.footer.action'] {
  display: flex !important;
  flex-direction: column;
  width: 100% !important;
}
`.trim()
