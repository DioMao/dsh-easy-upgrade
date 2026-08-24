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
  | 'matchedRepo'

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
  matchedRepo: '源码目录：{repo}',
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
  matchedRepo: 'Source: {repo}',
}