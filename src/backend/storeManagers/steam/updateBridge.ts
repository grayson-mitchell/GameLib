/**
 * Update of a bridge-installed game (Phase 74, D-10..D-16): the chunk-level delta run through the
 * download queue's 'update' element, with pause, resume and cancel like an install.
 *
 * Order: refuse while running (before any network or disk work) -> resolve the install from the
 * raw ACF -> refuse an unresolvable branch -> register the abort controller and the in-flight
 * entry -> planning status (hero "Planning update…", WR-07) -> exact peak-disk check from the manifest-pair estimate -> downloadSteamDepotsRust with
 * `delta` -> map the outcome -> GID-keyed follow-ups on done. A committed delta counts as done
 * even if the abort signal fired or the outcome says cancelled: commit is the point of no return. No retry here (D-16): a failure
 * before commit leaves the old build launchable, and the pipeline's own retries are all there is.
 * Exit contract: no timers or handles are created here.
 */
import i18next from 'i18next'
import type { InstallResult } from 'common/types/game_manager'
import { Path } from 'backend/schemas'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { getFileSize, sendGameStatusUpdate } from 'backend/utils'
import { getDiskInfo } from 'backend/utils/filesystem'
import type SteamGame from './games'
import { runBridgeUpdateFollowUps } from './bridge/bridgeUpdateFollowUps'
import { downloadSteamDepotsRust } from './depotRust/install'
import { STEAM_UPDATE_PLANNING_CONTEXT } from './depotRust/progressBridge'
import {
  estimateBridgeUpdate,
  resolveBridgeUpdateContext
} from './depotRust/updateEstimate'
import {
  getLastKnownSteamUpdateState,
  invalidateSteamUpdateState,
  STEAM_UPDATE_PICS_TTL_MS,
  type SteamUpdateEstimate
} from './updateDetection'

function isRunning(steamGame: SteamGame): boolean {
  const { deps, appId } = steamGame
  return (
    deps.steamLaunchRuntime.monitors.getBottleProcessMonitorPhase(appId) !==
      null || deps.steamSession.gameSession.bridgeLaunchesInFlight.has(appId)
  )
}

/** A cached estimate for the build detection currently sees, if still fresh. */
function freshCachedEstimate(steamGame: SteamGame): SteamUpdateEstimate | null {
  const state = getLastKnownSteamUpdateState(steamGame.deps, steamGame.appId)
  const e = state?.estimate
  if (
    e &&
    state?.targetBuild === e.targetBuild &&
    Date.now() - e.computedAt < STEAM_UPDATE_PICS_TTL_MS
  ) {
    return e
  }
  return null
}

export async function updateBridgeGame(
  steamGame: SteamGame,
  opts?: { unattended?: boolean }
): Promise<InstallResult> {
  const { deps, appId } = steamGame
  const title = steamGame.getGameInfo().title || appId

  if (isRunning(steamGame)) {
    return {
      status: 'error',
      error: i18next.t(
        'gamelib:steam.update.refusedRunning',
        'Quit {{title}} before updating it.',
        { title }
      )
    }
  }

  const { nativeInstallsInFlight } = deps.steamSession.gameSession
  const existing = nativeInstallsInFlight.get(appId)
  if (existing) {
    // T-23-12: a live run is joined, never doubled.
    if (!existing.aborted) return existing.promise
    // T-23-15: a run tearing down settles first.
    await existing.promise.catch(() => undefined)
  }

  const run = runBridgeUpdate(steamGame, title, opts?.unattended === true)
  const entry = { promise: run, aborted: false }
  nativeInstallsInFlight.set(appId, entry)
  void run.then(
    () => release(),
    () => release()
  )
  function release() {
    if (nativeInstallsInFlight.get(appId) === entry) {
      nativeInstallsInFlight.delete(appId)
    }
  }
  return run
}

async function runBridgeUpdate(
  steamGame: SteamGame,
  title: string,
  unattended: boolean
): Promise<InstallResult> {
  const { deps, appId } = steamGame
  const logUnattendedFailure = (
    phase: 'not started' | 'failed',
    reason: string
  ) => {
    if (unattended) {
      logInfo(
        `updateBridgeGame: appId ${appId} unattended=true update ${phase}: ${reason}`,
        LogPrefix.Steam
      )
    }
  }
  const clearStatus = () =>
    sendGameStatusUpdate(deps, {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })

  const ctx = await resolveBridgeUpdateContext(steamGame)
  if ('error' in ctx) {
    logUnattendedFailure('not started', ctx.error)
    return { status: 'error', error: ctx.error }
  }

  const known = getLastKnownSteamUpdateState(deps, appId)
  if (known?.reason === 'branch-unresolved') {
    const error = i18next.t(
      'gamelib:steam.update.branchUnknown',
      "GameLib can't see the {{branch}} branch of {{title}}, so it can't update it.",
      { branch: ctx.branch, title }
    )
    logUnattendedFailure('not started', error)
    return { status: 'error', error }
  }

  const reused =
    deps.aborts.has(appId) && deps.aborts.getSignal(appId)?.aborted === false
  const signal = reused
    ? deps.aborts.getSignal(appId)
    : deps.aborts.create(appId).signal
  try {
    // WR-07: label the hero for the whole pre-transfer stretch; the progress bridge clears it
    // with a plain 'updating' once the Rust job reports `planned`.
    sendGameStatusUpdate(deps, {
      appName: appId,
      runner: 'steam',
      status: 'updating',
      context: STEAM_UPDATE_PLANNING_CONTEXT
    })
    const estimate =
      freshCachedEstimate(steamGame) ??
      (await estimateBridgeUpdate(steamGame, { signal, unattended }))
    if ('error' in estimate) {
      if (signal?.aborted) {
        clearStatus()
        return { status: 'abort' }
      }
      logUnattendedFailure('not started', estimate.error)
      return { status: 'error', error: estimate.error }
    }
    if (signal?.aborted) {
      clearStatus()
      return { status: 'abort' }
    }

    const disk = await getDiskInfo(deps, Path.parse(ctx.steamappsDir))
    if (disk.freeSpace < estimate.peakBytes) {
      const error = i18next.t(
        'gamelib:steam.update.notEnoughDisk',
        'Not enough free space to update {{title}}: needs {{needed}} free, {{available}} available.',
        {
          title,
          needed: getFileSize(estimate.peakBytes),
          available: getFileSize(disk.freeSpace)
        }
      )
      logUnattendedFailure('not started', error)
      return { status: 'error', error }
    }

    logInfo(
      `updateBridgeGame: appId ${appId} starting delta (branch ${ctx.branch}, oldManifest=${estimate.oldManifestAvailable})`,
      LogPrefix.Steam
    )
    const outcome = await downloadSteamDepotsRust(appId, {
      installRuntime: deps.steamInstallRuntime,
      steamUser: deps.steamUser,
      config: deps.config,
      targetSteamappsDir: ctx.steamappsDir,
      installdir: ctx.installdir,
      os: 'windows',
      branch: ctx.branch,
      signal,
      unattended,
      delta: { oldGidByDepot: ctx.oldGidByDepot }
    })

    // Commit is the point of no return: a committed delta is finished work whatever the abort
    // signal says, so its follow-ups (shim re-handover, redists, cache invalidation) must run.
    const committed = outcome.delta?.committed === true
    if (outcome.status === 'cancelled' && !committed) {
      clearStatus()
      return { status: 'abort' }
    }
    if (outcome.status === 'error') {
      logWarning(
        `updateBridgeGame: appId ${appId} failed: ${outcome.error}`,
        LogPrefix.Steam
      )
      logUnattendedFailure('failed', outcome.error ?? 'unknown')
      clearStatus()
      return {
        status: 'error',
        error: outcome.error,
        errorAction: outcome.errorAction
      }
    }

    const delta = outcome.delta
    const report = await runBridgeUpdateFollowUps(steamGame, {
      changedPaths: delta?.changedFiles ?? [],
      fullReconcile: !delta || delta.mode === 'file_fallback',
      bridgeBottleName: ctx.bridgeBottleName
    })
    if (report.errors.length > 0) {
      logWarning(
        `updateBridgeGame: appId ${appId} follow-ups reported ${report.errors.length} error(s)`,
        LogPrefix.Steam
      )
    }
    invalidateSteamUpdateState(deps, appId)
    clearStatus()
    notify(deps, {
      title,
      body: i18next.t('gamelib:steam.update.finished', 'Update finished')
    })
    return { status: 'done' }
  } finally {
    if (!reused && signal && deps.aborts.getSignal(appId) === signal) {
      deps.aborts.delete(appId)
    }
  }
}
