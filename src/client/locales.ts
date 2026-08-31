export const NS = 'dsh-easy-upgrade'

export type UpgradeLocaleKey =
  | 'available'
  | 'checking'
  | 'check'
  | 'checkingFailed'
  | 'confirm'
  | 'confirmAhead'
  | 'confirmForceTest'
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
  | 'rollbackOnFailure'
  | 'rollbackOnFailureHint'
  | 'progressTitle'
  | 'viewLog'
  | 'hideLog'
  | 'stageUnknown'
  | 'stageFetch'
  | 'stageStop'
  | 'stageReset'
  | 'stageInstall'
  | 'stageClean'
  | 'stageBuild'
  | 'stageRollbackReset'
  | 'stageRollbackInstall'
  | 'stageRollbackClean'
  | 'stageRollbackBuild'
  | 'stageRestart'
  | 'phaseRollback'
  | 'logUnavailable'

export const zh: Record<UpgradeLocaleKey, string> = {
  available: '有新版本，立即更新',
  checking: '检查中…',
  check: '检查更新',
  checkingFailed: '检查更新失败：{message}',
  confirm: '升级将停止当前 DSH 服务，拉取远程主分支、安装依赖并重新构建后重启。确定继续吗？',
  confirmAhead: '升级将把仓库硬重置到远程主分支；本分支上 {ahead} 个尚未推送的本地提交会被丢弃。同时会停止当前 DSH 服务、安装依赖、重新构建并重启。确定继续吗？',
  confirmForceTest: '开发模式（forceUpdateTest）已开启：即使当前已是最新版本，仍会完整执行停止服务、硬重置到远程主分支、安装依赖、重建并重启。此操作不可逆，确定继续吗？',
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
  rollbackOnFailure: '失败时回滚到当前版本并重新构建',
  rollbackOnFailureHint: '勾选后，若升级流程中任意环节失败，将把源码重置回当前版本，并重新执行安装依赖、清理与构建后重启。更稳妥，但恢复耗时更长。',
  progressTitle: '正在升级：',
  viewLog: '查看日志',
  hideLog: '收起日志',
  stageUnknown: '处理中…',
  stageFetch: '获取远程更新',
  stageStop: '停止当前服务',
  stageReset: '重置源码',
  stageInstall: '安装依赖',
  stageClean: '清理构建缓存',
  stageBuild: '重新构建',
  stageRollbackReset: '回滚：重置源码',
  stageRollbackInstall: '回滚：安装依赖',
  stageRollbackClean: '回滚：清理构建缓存',
  stageRollbackBuild: '回滚：重新构建',
  stageRestart: '重启服务',
  phaseRollback: '升级失败，正在回滚：',
  logUnavailable: '日志暂不可用',
}

export const en: Record<UpgradeLocaleKey, string> = {
  available: 'New version — update now',
  checking: 'Checking…',
  check: 'Check for updates',
  checkingFailed: 'Update check failed: {message}',
  confirm: 'This stops the current DSH service, pulls the remote main branch, installs, builds, and restarts it. Continue?',
  confirmAhead: 'This will hard-reset the repository to the remote main branch, discarding {ahead} unpushed local commit(s) on this branch. It also stops the current DSH service, installs dependencies, rebuilds, and restarts. Continue?',
  confirmForceTest: 'Development mode (forceUpdateTest) is enabled: even though the local checkout is already up to date, this still stops the service, hard-resets to the remote main branch, installs, rebuilds, and restarts. This is irreversible — continue?',
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
  rollbackOnFailure: 'Roll back to my current version and rebuild on failure',
  rollbackOnFailureHint: 'When checked, a failure in any upgrade step resets the source back to your current revision and re-runs install, clean, and build before restarting. More reliable, but recovery takes longer.',
  progressTitle: 'Upgrading:',
  viewLog: 'View log',
  hideLog: 'Hide log',
  stageUnknown: 'Working…',
  stageFetch: 'Fetching remote updates',
  stageStop: 'Stopping current service',
  stageReset: 'Resetting source',
  stageInstall: 'Installing dependencies',
  stageClean: 'Cleaning build cache',
  stageBuild: 'Building',
  stageRollbackReset: 'Rollback: resetting source',
  stageRollbackInstall: 'Rollback: installing dependencies',
  stageRollbackClean: 'Rollback: cleaning build cache',
  stageRollbackBuild: 'Rollback: rebuilding',
  stageRestart: 'Restarting service',
  phaseRollback: 'Upgrade failed — rolling back:',
  logUnavailable: 'Log temporarily unavailable',
}