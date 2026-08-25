import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  IconDownloadOutline16,
  IconRefreshOutline16,
  Modal,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GithubRelease } from '../release-notes.ts'
import type { UpgradeState } from '../state.ts'
import { ReleaseNotes } from './ReleaseNotes.tsx'
import css from './upgrade.module.css'

export type UpgradeCellProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'dsh-easy-upgrade'>

type ApiResult =
  | { ok: true, state: UpgradeState }
  | { ok: false, error: { code: string, message: string } }

type ReleaseResult =
  | { ok: true, release: GithubRelease | null }
  | { ok: false, error: { code: string, message: string } }

const API_ROOT = '/dsh-upgrade/api'

/**
 * Root footer action. Wide mode intentionally contains text only; rail mode
 * contains the single upgrade/check icon required by the sidebar geometry.
 */
export function UpgradeCell({ wide, t }: UpgradeCellProps) {
  const [state, setState] = useState<UpgradeState | null>(null)
  const [checking, setChecking] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [release, setRelease] = useState<GithubRelease | null>(null)
  const [releaseLoading, setReleaseLoading] = useState(false)

  const refreshStatus = useCallback(async (): Promise<void> => {
    const result = await request('/status', 'GET')
    if (result.ok) {
      setState(result.state)
      // The server flag is authoritative: once the restarted service reports it
      // is no longer upgrading, release the local "restarting" state so the cell
      // returns to normal after the upgrade runner finishes.
      if (!result.state.upgrading) setUpgrading(false)
    }
  }, [])

  const check = useCallback(async (manual: boolean): Promise<void> => {
    if (checking || upgrading) return
    setChecking(true)
    if (manual) setManualError(null)
    const result = await request('/check', 'POST')
    setChecking(false)
    if (result.ok) {
      setState(result.state)
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
    const result = await request('/upgrade', 'POST')
    if (!result.ok) {
      setUpgrading(false)
      setManualError(result.error.message)
    }
  }, [upgrading])

  useEffect(() => {
    void refreshStatus()
    // Host owns the periodic Git query/retry policy. The browser merely reads
    // its cache once per hour; this keeps automatic browser failures silent.
    const timer = window.setInterval(() => { void refreshStatus() }, 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [refreshStatus])

  // While an upgrade is pending (submitted locally, or the server reports one
  // in progress), poll status frequently so the cell recovers automatically as
  // soon as the restarted service is back and reports it is no longer upgrading.
  const pending = upgrading || state?.upgrading === true
  useEffect(() => {
    if (!pending) return
    const poll = window.setInterval(() => { void refreshStatus() }, 3000)
    return () => window.clearInterval(poll)
  }, [pending, refreshStatus])

  const version = state?.status?.localVersion ?? 'DSH'
  const updateAvailable = (state?.status?.behind ?? 0) > 0
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
    return <div style={wideRowStyle} aria-live="polite">{t('restartPending')}</div>
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
        description={ahead > 0 ? t('confirmAhead', { ahead }) : t('confirm')}
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

async function request(path: string, method: 'GET' | 'POST'): Promise<ApiResult> {
  try {
    const response = await fetch(`${API_ROOT}${path}`, {
      method,
      credentials: 'same-origin',
      ...(method === 'POST' ? { headers: { 'content-type': 'application/json' } } : {}),
    })
    const parsed = await response.json() as ApiResult
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

const containerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  width: 'calc(100% + 8px)',
  minWidth: 0,
  margin: '4px -4px',
}

const wideRowStyle = {
  width: 'calc(100% + 8px)',
  minWidth: 0,
  height: 34,
  boxSizing: 'border-box' as const,
  margin: '4px -4px',
  padding: '6px 10px',
  overflow: 'hidden',
  whiteSpace: 'nowrap' as const,
  textOverflow: 'ellipsis',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  lineHeight: '22px',
}

const errorStyle = {
  margin: '0 4px 4px 10px',
  color: 'var(--dsw-alias-state-error-primary)',
  fontSize: 11,
  lineHeight: '16px',
  overflowWrap: 'anywhere' as const,
}