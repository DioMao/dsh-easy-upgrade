/**
 * Upgrade progress contract shared by the host half, the detached runner and
 * the browser client. The stage ids are interpolated into the runner's inline
 * source (upgrade-runner.ts) so the detached process reports exactly the ids
 * the client knows how to label: this module is the single source of truth.
 */

const STAGE_VALUES = [
  'fetch',
  'stop-current-dsh',
  'reset',
  'install',
  'clean',
  'build',
  'rollback-reset',
  'rollback-install',
  'rollback-clean',
  'rollback-build',
  'restart',
] as const

export type UpgradeStage = (typeof STAGE_VALUES)[number]

/** Ordered stage list; also the set the client label map must cover. */
export const UPGRADE_STAGES: readonly UpgradeStage[] = STAGE_VALUES

/** Named stage constants for the runner template (STAGE.RESET, …). */
export const UPGRADE_STAGE: Readonly<Record<string, UpgradeStage>> = Object.freeze(
  Object.fromEntries(STAGE_VALUES.map(stage => [stage.toUpperCase().replace(/-/g, '_'), stage])),
)

/** Lifecycle phase of the detached runner, kept in addition to the stage. */
export type ProgressPhase = 'upgrading' | 'rollback' | 'done' | 'failed'

/** Live progress payload served by the runner's 127.0.0.1 HTTP endpoint. */
export interface UpgradeProgressInfo {
  phase: ProgressPhase
  stage: UpgradeStage | null
  startedAt: string
  finishedAt: string | null
  from: string | null
  to: string | null
}