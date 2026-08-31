import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  IconChevronDownOutline14,
  IconChevronUpOutline14,
  IconDownloadOutline16,
  IconLoadingOutline16,
  IconRefreshOutline16,
  Modal,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GithubRelease } from '../release-notes.ts'
import type { UpgradeProgressInfo } from '../progress.ts'
import type { UpgradeProgress, UpgradeState } from '../state.ts'
import { ReleaseNotes } from './ReleaseNotes.tsx'
import { STAGE_LABEL_KEYS } from './stages.ts'
import css from './upgrade.module.css'

export type UpgradeCellProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'dsh-easy-upgrade'>

type ApiResult =
  | { ok: true, state: UpgradeState, forceUpdateTest?: boolean }
  | { ok: false, error: { code: string, message: string } }

type LogApiResult =
  | { ok: true, log: string }
  | { ok: false, error: { code: string, message: string } }

type ReleaseResult =
  | { ok: true, release: GithubRelease | null }
  | { ok: false, error: { code: string, message: string } }

type RunnerProgressPayload =
  | { ok: true, progress: UpgradeProgressInfo }
  | { ok: false }

type RunnerLogPayload =
  | { ok: true, log: string }
  | { ok: false }

const API_ROOT = '/dsh-upgrade/api'
// Consecutive failed polls before giving up on the detached progress server;
// it exits at restart, so four misses (~8s) mean the service is coming back.
const RUNNER_MAX_FAILURES = 4

/**
 * Root footer action. Wide mode intentionally contains text only; rail mode
 * contains the single upgrade/check icon required by the sidebar geometry.
 * While DSH is stopped by the upgrade, live stage/log data comes from the
 * detached runner's loopback progress server (see state.progress).
 */
export function UpgradeCell({ wide, t }: UpgradeCellProps) {
  const [state, setState] = useState<UpgradeState | null>(null)
  const [checking, setChecking] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [release, setRelease] = useState<GithubRelease | null>(null)
  const [releaseLoading, setReleaseLoading] = useState(false)
  const [rollbackOnFailure, setRollbackOnFailure] = useState(false)
  const [progressInfo, setProgressInfo] = useState<UpgradeProgress | null>(null)
  const [runProgress, setRunProgress] = useState<UpgradeProgressInfo | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [liveLog, setLiveLog] = useState<string | null>(null)
  // Development-mode mirror of the row config: lets even an up-to-date checkout
  // show the upgrade entry so the full flow can be exercised locally.
  const [forceUpdateTest, setForceUpdateTest] = useState(false)

  // The server flag is authoritative. Keep the progress server address in sync
  // while an upgrade runs, and tear the whole progress UI down once the
  // restarted service reports it is no longer upgrading.
  const syncProgress = useCallback((value: UpgradeState): void => {
    if (value.progress !== null) setProgressInfo(value.progress)
    if (!value.upgrading) {
      setUpgrading(false)
      setProgressInfo(null)
      setRunProgress(null)
      setLiveLog(null)
      setLogOpen(false)
    }
  }, [])

  const refreshStatus = useCallback(async (): Promise<void> => {
    const result = await request('/status', 'GET')
    if (result.ok) {
      setState(result.state)
      setForceUpdateTest(result.forceUpdateTest === true)
      syncProgress(result.state)
    }
  }, [syncProgress])

  const check = useCallback(async (manual: boolean): Promise<void> => {
    if (checking || upgrading) return
    setChecking(true)
    if (manual) setManualError(null)
    const result = await request('/check', 'POST')
    setChecking(false)
    if (result.ok) {
      setState(result.state)
      setForceUpdateTest(result.forceUpdateTest === true)
      return
    }
    if (manual) setManualError(result.error.message)
  }, [checking, upgrading])

  // Best-effort GitHub release notes for the confirmation dialog. Failure is
  // silent: the dialog degrades to its generic copy when release === null.
  const loadRelease = useCallback(async (): Promise<void> => {
    setReleaseLoading(true)
    setRelease(null)
    const result = await requestRelease()
    setReleaseLoading(false)
    if (result.ok) setRelease(result.release)
  }, [])

  // Replace the native confirm() with the framework Modal: open it first so the
  // release-notes region can show its loading state while the host fetches.
  const openUpgradeDialog = useCallback((): void => {
    if (checking || upgrading) return
    setManualError(null)
    setDialogOpen(true)
    void loadRelease()
  }, [checking, loadRelease, upgrading])

  const closeUpgradeDialog = useCallback((): void => {
    setDialogOpen(false)
  }, [])

  const confirmUpgrade = useCallback(async (): Promise<void> => {
    if (upgrading) return
    setDialogOpen(false)
    setUpgrading(true)
    setManualError(null)
    const result = await request('/upgrade', 'POST', { rollbackOnFailure })
    if (!result.ok) {
      setUpgrading(false)
      setManualError(result.error.message)
      return
    }
    // Capture the detached progress server's address before the runner stops
    // this process; /status polling fails from now until the service is back.
    void refreshStatus()
  }, [refreshStatus, rollbackOnFailure, upgrading])

  useEffect(() => {
    void refreshStatus()
    // Host owns the periodic Git query/retry policy. The browser merely reads
    // its cache once per hour; this keeps automatic browser failures silent.
    const timer = window.setInterval(() => { void refreshStatus() }, 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [refreshStatus])

  // While an upgrade is pending, poll /status frequently; once the restarted
  // service is back and reports it is no longer upgrading, the cell recovers.
  // Between stop and restart /status fails, so the detached runner's progress
  // server (state.progress) takes over for stage and log display.
  const pending = upgrading || state?.upgrading === true
  useEffect(() => {
    if (!pending) return
    let runnerFailures = 0
    const tick = async (): Promise<void> => {
      const result = await request('/status', 'GET')
      if (result.ok) {
        runnerFailures = 0
        setState(result.state)
        syncProgress(result.state)
      } else if (progressInfo !== null) {
        const payload = await requestRunner<RunnerProgressPayload>(
          `${runnerUrl(progressInfo)}/progress?token=${encodeURIComponent(progressInfo.token)}`,
        )
        if (payload !== null && payload.ok) {
          runnerFailures = 0
          setRunProgress(payload.progress)
        } else {
          runnerFailures += 1
          if (runnerFailures >= RUNNER_MAX_FAILURES) setProgressInfo(null)
        }
      }
      if (logOpen) {
        if (progressInfo !== null) {
          const payload = await requestRunner<RunnerLogPayload>(
            `${runnerUrl(progressInfo)}/log?token=${encodeURIComponent(progressInfo.token)}`,
          )
          setLiveLog(payload !== null && payload.ok ? payload.log : null)
        } else {
          const result = await requestLog()
          setLiveLog(result.ok ? result.log : null)
        }
      }
    }
    const poll = window.setInterval(() => { void tick() }, 2000)
    return () => window.clearInterval(poll)
  }, [logOpen, pending, progressInfo, syncProgress])

  const version = state?.status?.localVersion ?? 'DSH'
  const updateAvailable = (state?.status?.behind ?? 0) > 0 || forceUpdateTest
  const tooltip = useMemo(() => updateAvailable
    ? t('railUpgrade')
    : t('railCheck', { version }), [t, updateAvailable, version])

  if (!wide) {
    const action = updateAvailable ? openUpgradeDialog : () => { void check(true) }
    // Rail geometry is a single circular icon, so a manual-check failure is
    // surfaced through the accessible label / Tooltip overlay (visible on
    // hover and keyboard focus) instead of an inline error row.
    const label = manualError !== null
      ? t('railCheckFailed', { message: manualError })
      : tooltip
    return (
      <div role="status" aria-live="polite" style={{ display: 'contents' }}>
        <Tooltip label={label} side="right" maxWidth={260}>
          <Button
            variant="ghost"
            aria-label={label}
            disabled={checking || upgrading}
            onClick={() => {
              if (manualError !== null) setManualError(null)
              action()
            }}
            style={{ width: 36, minWidth: 36, height: 36, padding: 0, borderRadius: '50%' }}
          >
            {updateAvailable
              ? <IconDownloadOutline16 size={16} />
              : <IconRefreshOutline16 size={16} />}
          </Button>
        </Tooltip>
      </div>
    )
  }

  if (upgrading || state?.upgrading === true) {
    const stage = runProgress?.stage ?? null
    const heading = runProgress?.phase === 'rollback' ? t('phaseRollback') : t('progressTitle')
    const stageLabel = stage === null ? t('stageUnknown') : t(STAGE_LABEL_KEYS[stage])
    return (
      <div style={pendingStyle} aria-live="polite">
        <div style={progressRowStyle}>
          <IconLoadingOutline16 size={14} className={css.spinner} />
          <span className={css.progressText} title={`${heading}${stageLabel}`}>{heading}{stageLabel}</span>
          <button
            type="button"
            className={css.logToggle}
            aria-expanded={logOpen}
            onClick={() => setLogOpen(open => !open)}
          >
            {logOpen ? <IconChevronUpOutline14 size={14} /> : <IconChevronDownOutline14 size={14} />}
            {logOpen ? t('hideLog') : t('viewLog')}
          </button>
        </div>
        {logOpen && (
          <div className={css.logPanel} role="status">
            {liveLog !== null ? liveLog : t('logUnavailable')}
          </div>
        )}
      </div>
    )
  }

  const ahead = state?.status?.ahead ?? 0
  const fromVersion = state?.status?.localVersion ?? null
  const toVersion = state?.status?.remoteVersion ?? null
  const notesBody = releaseLoading
    ? <div className={css.notesFallback}>{t('releaseNotesLoading')}</div>
    : release !== null && release.body !== null
      ? <div className={css.notesBox}><ReleaseNotes text={release.body} /></div>
      : release !== null
        ? <div className={css.notesFallback}>{t('releaseNotesEmpty')}</div>
        : <div className={css.notesFallback}>{t('releaseNotesUnavailable')}</div>

  return (
    <>
      <div style={containerStyle}>
        {updateAvailable ? (
          <Button
            size="sm"
            variant="primary"
            disabled={checking}
            onClick={openUpgradeDialog}
            style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 12 }}
          >
            {t('available')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={checking}
            onClick={() => { void check(true) }}
            aria-label={t('check')}
            title={t('upToDate')}
            style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 12 }}
          >
            {checking ? t('checking') : t('currentVersion', { version })}
          </Button>
        )}
        {manualError !== null && (
          <div style={errorStyle} role="status">
            {t('checkingFailed', { message: manualError })}
          </div>
        )}
      </div>
      <Modal
        open={dialogOpen}
        onClose={closeUpgradeDialog}
        title={t('upgradeTitle')}
        description={ahead > 0 ? t('confirmAhead', { ahead }) : forceUpdateTest ? t('confirmForceTest') : t('confirm')}
        closeLabel={t('cancel')}
        className={css.upgradeDialog}
        footer={(
          <>
            <Button variant="outline" onClick={closeUpgradeDialog}>{t('cancel')}</Button>
            <Button variant="primary" onClick={() => { void confirmUpgrade() }}>{t('confirmUpgrade')}</Button>
          </>
        )}
      >
        <div className={css.summary}>
          {t('versionChange', {
            // The template carries the v prefixes; pass bare versions.
            from: fromVersion === null ? '—' : fromVersion,
            to: toVersion === null ? '—' : toVersion,
          })}
        </div>
        <div className={css.sourceWarning}>{t('sourceWarning')}</div>
        <div className={css.rollbackOption}>
          <label className={css.rollbackLabel}>
            <input
              type="checkbox"
              checked={rollbackOnFailure}
              onChange={(event) => setRollbackOnFailure(event.target.checked)}
            />
            <span>{t('rollbackOnFailure')}</span>
          </label>
          <div className={css.rollbackHint}>{t('rollbackOnFailureHint')}</div>
        </div>
        <div className={css.notesHeader}>
          <span className={css.notesTitle}>{t('releaseNotesTitle')}</span>
          {release !== null && (
            <span className={css.notesMeta}>
              {t('releaseMeta', {
                tag: release.tagName,
                date: formatDate(release.publishedAt),
              })}
            </span>
          )}
        </div>
        {notesBody}
      </Modal>
    </>
  )
}

function formatDate(value: string | null): string {
  if (value === null) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

async function request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(`${API_ROOT}${path}`, {
      method,
      credentials: 'same-origin',
      ...(method === 'POST'
        ? { headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }
        : {}),
    })
    const parsed = await response.json() as ApiResult
    if (!response.ok && parsed.ok) return { ok: false, error: { code: 'http-error', message: `HTTP ${response.status}` } }
    return parsed
  } catch (error) {
    return { ok: false, error: { code: 'network-error', message: error instanceof Error ? error.message : String(error) } }
  }
}

async function requestLog(): Promise<LogApiResult> {
  try {
    const response = await fetch(`${API_ROOT}/log`, {
      method: 'GET',
      credentials: 'same-origin',
    })
    const parsed = await response.json() as LogApiResult
    if (!response.ok && parsed.ok) return { ok: false, error: { code: 'http-error', message: `HTTP ${response.status}` } }
    return parsed
  } catch (error) {
    return { ok: false, error: { code: 'network-error', message: error instanceof Error ? error.message : String(error) } }
  }
}

async function requestRelease(): Promise<ReleaseResult> {
  try {
    const response = await fetch(`${API_ROOT}/release`, {
      method: 'GET',
      credentials: 'same-origin',
    })
    const parsed = await response.json() as ReleaseResult
    if (!response.ok && parsed.ok) return { ok: false, error: { code: 'http-error', message: `HTTP ${response.status}` } }
    return parsed
  } catch (error) {
    return { ok: false, error: { code: 'network-error', message: error instanceof Error ? error.message : String(error) } }
  }
}

/** Cross-origin fetch against the detached runner's loopback progress server. */
async function requestRunner<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { credentials: 'omit' })
    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}

function runnerUrl(progress: UpgradeProgress): string {
  return `http://127.0.0.1:${progress.port}`
}

const containerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  width: 'calc(100% + 8px)',
  minWidth: 0,
  margin: '4px -4px',
}

const pendingStyle = {
  width: 'calc(100% + 8px)',
  minWidth: 0,
  boxSizing: 'border-box' as const,
  margin: '4px -4px',
  padding: '6px 10px',
}

const progressRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
}

const errorStyle = {
  margin: '0 4px 4px 10px',
  color: 'var(--dsw-alias-state-error-primary)',
  fontSize: 11,
  lineHeight: '16px',
  overflowWrap: 'anywhere' as const,
}