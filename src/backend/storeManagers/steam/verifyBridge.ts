/**
 * Verify of a bridge-installed game (quick 261120-p2j): Mac Steam never sees a bridge bottle's
 * `steamapps`, so GameLib is the only verifier. A chunk-level Rust depot job runs over the ACF's
 * InstalledDepots GIDs (depotRust/verify.ts): it fetches only chunks whose SHA-1 fails, keeps the
 * installed build, and never touches files the manifests do not own.
 *
 * Order: refuse while running -> refuse while an install or update is in flight -> register this
 * run in nativeInstallsInFlight (so an auto-update or install joins it instead of racing on the
 * same tree) -> resolve the install from the raw ACF -> register the abort controller -> run the
 * job -> ALWAYS run the bridge follow-ups (a verify that fails or is cancelled mid-way may already
 * have put the genuine steam_api DLL back over the shim; the game must still launch through the
 * shim) -> map the outcome.
 * dispatch.repair already sent 'repairing' before awaiting this; the progress bridge refreshes it.
 * Exit contract: no timers or handles are created here.
 */
import type { ExecResult } from 'common/types'
import type { InstallResult } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type SteamGame from './games'
import { runBridgeUpdateFollowUps } from './bridge/bridgeUpdateFollowUps'
import { verifyInstalledDepotsRust } from './depotRust/verify'
import { resolveBridgeUpdateContext } from './depotRust/updateEstimate'
import { readAcfInstalledDepots } from './acfInstalledDepots'
import { isBridgeGameRunning } from './updateBridge'

/** The collaborators a bridge verify reaches; a test passes fakes instead of mocking the modules. */
interface VerifyBridgeCollaborators {
  isRunning: typeof isBridgeGameRunning
  resolveContext: typeof resolveBridgeUpdateContext
  readInstalledDepots: typeof readAcfInstalledDepots
  verifyDepots: typeof verifyInstalledDepotsRust
  runFollowUps: typeof runBridgeUpdateFollowUps
}

const defaultCollaborators: VerifyBridgeCollaborators = {
  isRunning: isBridgeGameRunning,
  resolveContext: resolveBridgeUpdateContext,
  readInstalledDepots: readAcfInstalledDepots,
  verifyDepots: verifyInstalledDepotsRust,
  runFollowUps: runBridgeUpdateFollowUps
}

export async function verifyBridgeGame(
  steamGame: SteamGame,
  collab: VerifyBridgeCollaborators = defaultCollaborators
): Promise<ExecResult> {
  const { deps, appId } = steamGame
  const title = steamGame.getGameInfo().title || appId

  if (collab.isRunning(steamGame)) {
    throw new Error(`Quit ${title} before verifying it.`)
  }

  const { nativeInstallsInFlight } = deps.steamSession.gameSession
  const existing = nativeInstallsInFlight.get(appId)
  if (existing && !existing.aborted) {
    throw new Error(
      `${title} is installing or updating; verify it when that finishes.`
    )
  }
  if (existing) {
    // A run tearing down settles first.
    await existing.promise.catch(() => undefined)
  }

  const run = runBridgeVerify(steamGame, title, collab)
  const entry = {
    promise: run.then(
      (): InstallResult => ({ status: 'done' }),
      (error: unknown): InstallResult => ({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    ),
    aborted: false
  }
  nativeInstallsInFlight.set(appId, entry)
  const release = () => {
    if (nativeInstallsInFlight.get(appId) === entry) {
      nativeInstallsInFlight.delete(appId)
    }
  }
  void entry.promise.then(release, release)
  return run
}

async function runBridgeVerify(
  steamGame: SteamGame,
  title: string,
  collab: VerifyBridgeCollaborators
): Promise<ExecResult> {
  const { deps, appId } = steamGame

  const ctx = await collab.resolveContext(steamGame)
  if ('error' in ctx) throw new Error(ctx.error)
  const installed = await collab.readInstalledDepots(
    deps,
    ctx.steamappsDir,
    appId
  )
  if (!installed) throw new Error('The install manifest could not be read')

  const reused =
    deps.aborts.has(appId) && deps.aborts.getSignal(appId)?.aborted === false
  const signal = reused
    ? deps.aborts.getSignal(appId)
    : deps.aborts.create(appId).signal
  try {
    logInfo(
      `verifyBridgeGame: appId ${appId} starting verify (branch ${ctx.branch}, build ${installed.buildid ?? 'unknown'}, ${installed.installedDepots.length} depot(s))`,
      LogPrefix.Steam
    )
    const outcome = await collab.verifyDepots(appId, {
      installRuntime: deps.steamInstallRuntime,
      steamUser: deps.steamUser,
      config: deps.config,
      targetSteamappsDir: ctx.steamappsDir,
      installdir: ctx.installdir,
      os: 'windows',
      branch: ctx.branch,
      signal,
      installed: {
        buildid: installed.buildid,
        depots: installed.installedDepots
      }
    })

    // The job was attempted: re-place the shim and re-check the shared-redist ledger whatever
    // the outcome.
    const report = await collab.runFollowUps(steamGame, {
      changedPaths: [],
      fullReconcile: true,
      bridgeBottleName: ctx.bridgeBottleName
    })

    if (outcome.status === 'cancelled') {
      throw new Error(`Verify of ${title} was cancelled`)
    }
    if (outcome.status === 'error') {
      logWarning(
        `verifyBridgeGame: appId ${appId} failed: ${outcome.error}`,
        LogPrefix.Steam
      )
      throw new Error(`Could not verify ${title}: ${outcome.error}`)
    }
    if (report.errors.length > 0) {
      throw new Error(
        `Verified ${title}, but the bridge follow-ups failed: ${report.errors.join('; ')}`
      )
    }
    const lines = [
      ...(outcome.skippedDepots?.length
        ? [`skipped depots: ${outcome.skippedDepots.join(', ')}`]
        : []),
      `follow-ups: shimTouched=${report.shimTouched} redistRan=${report.redistRan} drmPrefetched=${report.drmPrefetched}`
    ]
    for (const line of lines) {
      logInfo(`verifyBridgeGame appId ${appId}: ${line}`, LogPrefix.Steam)
    }
    return { stdout: lines.join('\n'), stderr: '' }
  } finally {
    if (!reused && signal && deps.aborts.getSignal(appId) === signal) {
      deps.aborts.delete(appId)
    }
  }
}
