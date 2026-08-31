import type { UpgradeStage } from '../progress.ts'
import type { UpgradeLocaleKey } from './locales.ts'

/** Map every runner stage id to the locale key that labels it in both dictionaries. */
export const STAGE_LABEL_KEYS: Record<UpgradeStage, UpgradeLocaleKey> = {
  fetch: 'stageFetch',
  'stop-current-dsh': 'stageStop',
  reset: 'stageReset',
  install: 'stageInstall',
  clean: 'stageClean',
  build: 'stageBuild',
  'rollback-reset': 'stageRollbackReset',
  'rollback-install': 'stageRollbackInstall',
  'rollback-clean': 'stageRollbackClean',
  'rollback-build': 'stageRollbackBuild',
  restart: 'stageRestart',
}