export const NS = 'dsh-easy-upgrade'

export type UpgradeLocaleKey =
  | 'available'
  | 'checking'
  | 'check'
  | 'checkingFailed'
  | 'confirm'
  | 'confirmAhead'
  | 'currentVersion'
  | 'restartPending'
  | 'upToDate'
  | 'railCheck'
  | 'railCheckFailed'
  | 'railUpgrade'
  | 'upgradeTitle'
  | 'cancel'
  | 'confirmUpgrade'
  | 'sourceWarning'
  | 'versionChange'
  | 'releaseNotesTitle'
  | 'releaseNotesLoading'
  | 'releaseNotesUnavailable'
  | 'releaseNotesEmpty'
  | 'releaseMeta'

export const zh: Record<UpgradeLocaleKey, string> = {
  available: '有新版本，立即更新',
  checking: '检查中…',
  check: '检查更新',
  checkingFailed: '检查更新失败：{message}',
  confirm: '升级将停止当前 DSH 服务，拉取远程主分支、安装依赖并重新构建后重启。确定继续吗？',
  confirmAhead: '升级将把仓库硬重置到远程主分支；本分支上 {ahead} 个尚未推送的本地提交会被丢弃。同时会停止当前 DSH 服务、安装依赖、重新构建并重启。确定继续吗？',
  currentVersion: 'v{version}',
  restartPending: '正在升级，服务即将重启…',
  upToDate: '已是最新版本',
  railCheck: '检查 DSH 更新（当前 {version}）',
  railCheckFailed: '检查失败：{message}',
  railUpgrade: '发现新版本，立即升级',
  upgradeTitle: '确认升级 DSH',
  cancel: '取消',
  confirmUpgrade: '确认升级',
    sourceWarning: '本插件适用于本地存在源码的官方原版 DSH checkout。若你修改过源码、使用 fork，或不确定工作区来源，请谨慎升级：升级会将源码重置到远程分支。',
  versionChange: 'v{from} → v{to}',
  releaseNotesTitle: '更新内容',
  releaseNotesLoading: '正在获取 GitHub 更新说明…',
  releaseNotesUnavailable: '未能获取 GitHub 更新说明，仍可继续升级。',
  releaseNotesEmpty: '该版本没有发布说明。',
  releaseMeta: '{tag} · {date}',
}

export const en: Record<UpgradeLocaleKey, string> = {
  available: 'New version — update now',
  checking: 'Checking…',
  check: 'Check for updates',
  checkingFailed: 'Update check failed: {message}',
  confirm: 'This stops the current DSH service, pulls the remote main branch, installs, builds, and restarts it. Continue?',
  confirmAhead: 'This will hard-reset the repository to the remote main branch, discarding {ahead} unpushed local commit(s) on this branch. It also stops the current DSH service, installs dependencies, rebuilds, and restarts. Continue?',
  currentVersion: 'v{version}',
  restartPending: 'Upgrading — the service will restart…',
  upToDate: 'Up to date',
  railCheck: 'Check DSH updates (current {version})',
  railCheckFailed: 'Check failed: {message}',
  railUpgrade: 'New version available — upgrade now',
  upgradeTitle: 'Confirm DSH upgrade',
  cancel: 'Cancel',
  confirmUpgrade: 'Upgrade now',
    sourceWarning: 'This plugin is intended for an unmodified official DSH source checkout. If you changed the source, use a fork, or are unsure of the checkout origin, upgrade with caution: it resets the checkout to its remote branch.',
  versionChange: 'v{from} → v{to}',
  releaseNotesTitle: 'Release notes',
  releaseNotesLoading: 'Fetching GitHub release notes…',
  releaseNotesUnavailable: 'Could not fetch GitHub release notes. You can still continue with the upgrade.',
  releaseNotesEmpty: 'This release has no notes.',
  releaseMeta: '{tag} · {date}',
}