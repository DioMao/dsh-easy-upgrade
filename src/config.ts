import { homedir } from 'node:os'
import { join } from 'node:path'

/** User-configurable values accepted from the Cordis row. */
export interface UpgradeConfigInput {
  repoDir?: unknown
  branch?: unknown
  checkIntervalMs?: unknown
  retryCount?: unknown
  retryDelayMs?: unknown
  stateDir?: unknown
  logMaxBytes?: unknown
  forceUpdateTest?: unknown
}

/** Normalized, safe configuration used internally. */
export interface UpgradeConfig {
  /**
   * Absolute path of the deepseek-harness checkout to check/upgrade. An empty
   * string means "auto-match": the checkout is located from the running dsh
   * launch at boot (see `detectSourceInstall`), instead of trusting a hardcoded
   * path. An explicit value from the Cordis row always wins and skips probing.
   */
  repoDir: string
  branch: string
  checkIntervalMs: number
  retryCount: number
  retryDelayMs: number
  stateDir: string
  logMaxBytes: number
  /**
   * Development escape hatch. When true, the upgrade flow skips the
   * "already up to date" guard so a full reset/install/clean/build/restart can
   * be exercised repeatedly against origin/<branch>, even when the local
   * checkout already matches it. Disabled by default; enable only in a dev
   * profile patch, never for production users.
   */
  forceUpdateTest: boolean
}

/**
 * Empty default: no implicit path. When the Cordis row leaves `repoDir` unset,
 * the plugin matches the current dsh launch to its source checkout at boot.
 */
const DEFAULT_REPO = ''
const DEFAULT_BRANCH = 'master'
const DEFAULT_INTERVAL = 60 * 60 * 1000
const DEFAULT_RETRIES = 3
const DEFAULT_RETRY_DELAY = 5 * 1000
const DEFAULT_LOG_MAX_BYTES = 15 * 1024 * 1024

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

function positiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Resolve row config while putting upper bounds around retry and timer values. */
export function resolveConfig(input: UpgradeConfigInput | undefined): UpgradeConfig {
  const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return {
    repoDir: stringValue(input?.repoDir, DEFAULT_REPO),
    branch: stringValue(input?.branch, DEFAULT_BRANCH),
    checkIntervalMs: positiveInteger(input?.checkIntervalMs, DEFAULT_INTERVAL, 60_000, 24 * 60 * 60 * 1000),
    retryCount: positiveInteger(input?.retryCount, DEFAULT_RETRIES, 0, 3),
    retryDelayMs: positiveInteger(input?.retryDelayMs, DEFAULT_RETRY_DELAY, 1_000, 60_000),
    stateDir: stringValue(input?.stateDir, join(dshHome, 'dsh-easy-upgrade')),
    logMaxBytes: positiveInteger(input?.logMaxBytes, DEFAULT_LOG_MAX_BYTES, 1024 * 1024, 1024 * 1024 * 1024),
    forceUpdateTest: booleanValue(input?.forceUpdateTest, false),
  }
}