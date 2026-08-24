import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { UpgradeCell } from './UpgradeCell.tsx'
import { en, NS, type UpgradeLocaleKey, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-easy-upgrade': UpgradeLocaleKey
  }
}

/** Browser services this small footer component consumes. */
export const inject = ['slots', 'locale']

/** Register localized client UI into the sidebar footer action list. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-easy-upgrade: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-easy-upgrade',
    locale: NS,
  }, UpgradeCell))
}