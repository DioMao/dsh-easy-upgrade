import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createApiHandler, UpgradeController } from './api.js'
import { resolveConfig, type UpgradeConfigInput } from './config.js'
import { detectSourceInstall } from './detect.js'
import { StateStore, type LaunchSpec } from './state.js'
import { isTrustedApiRequest } from './trust-fence.js'

export const name = 'dsh-easy-upgrade'
export const inject = ['webServer']

interface WebRuntimeLike {
  trustedHosts?: readonly string[]
}

/**
 * Host half: exposes a same-origin status/check/upgrade API and owns the
 * non-destructive background check schedule. The client half supplies UI.
 */
export function apply(ctx: Context, input?: UpgradeConfigInput): void {
  const config = resolveConfig(input)
  const store = new StateStore(config.stateDir)
  // `process.argv` begins at the program entrypoint; Node runtime flags such
  // as `--import tsx/esm` live separately in `process.execArgv`. Preserve both
  // so the detached updater can replay the actual DSH launch rather than
  // starting a TypeScript entrypoint as plain Node JavaScript.
  const launch: LaunchSpec = {
    execPath: process.execPath,
    args: [...process.execArgv, ...process.argv.slice(1)],
    cwd: process.cwd(),
  }
  const logger = (message: string): void => {
    const candidate = (ctx as unknown as { logger?: { info?: (text: string) => void, warn?: (text: string) => void } }).logger
    candidate?.info?.(`[dsh-easy-upgrade] ${message}`)
  }

  const controller = new UpgradeController(config, store, launch, logger)
  const trustedHosts = (): readonly string[] => {
    const runtime = ctx.get('webRuntime') as WebRuntimeLike | undefined
    return Array.isArray(runtime?.trustedHosts) ? runtime.trustedHosts : []
  }
  const api = createApiHandler(controller, request => isTrustedApiRequest(request, trustedHosts()))

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-upgrade/api',
    handler: api,
  }), 'dsh-easy-upgrade: API routes')

  // Boot the plugin: prepare the state dir, clear any stale "upgrading" flag a
  // previous (now-dead) process may have left, cap the log, then run the first
  // update check (which initializes the UI). Ordering matters here — the stale
  // flag reset must finish before the first check writes state back.
  void (async () => {
    try {
      await store.ensure()
      await store.writeLaunch(launch)
      // Auto-match the running dsh to its source checkout when the row did not
      // pin `repoDir`: without a checkout the git-based check cannot run, and
      // a stale hardcoded path would point the upgrade at the wrong directory.
      if (config.repoDir === '') {
        try {
          const detected = await detectSourceInstall(launch)
          if (detected !== null) {
            config.repoDir = detected.repoDir
            controller.setInstall('source', detected.repoDir)
            logger(`matched source checkout at ${detected.repoDir} (${detected.entryKind} entry: ${detected.entry})`)
          } else {
            controller.setInstall('unknown', null)
            logger('no deepseek-harness source checkout matched the current launch; upgrade disabled until repoDir is configured')
          }
        } catch (error) {
          controller.setInstall('unknown', null)
          logger(`source-checkout detection failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const bootState = await store.read()
      if (bootState.upgrading) {
        await store.write({ ...bootState, upgrading: false })
        logger('cleared stale upgrading flag left by a previous process')
      }
      await store.trimLog(config.logMaxBytes)
      await controller.check()
    } catch (error) {
      // A boot-time failure must never take the plugin or the service down; the
      // periodic check/trim below keeps retrying.
      logger(`boot failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  })()
  ctx.effect(() => {
    const timer = setInterval(() => {
      // The restarted service writes its stdout/stderr here for as long as it
      // runs, so also trim upgrade.log on every periodic tick.
      void store.trimLog(config.logMaxBytes)
      void controller.check().catch(error => logger(`automatic update check failed: ${error instanceof Error ? error.message : String(error)}`))
    }, config.checkIntervalMs)
    return () => clearInterval(timer)
  }, 'dsh-easy-upgrade: hourly update checks')
}