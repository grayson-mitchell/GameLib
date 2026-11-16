/**
 * Update-aware poll tick (Phase 74, D-11): watches a Steam-owned update of an installed game.
 * Progress shows as 'updating'; completion needs the ACF to stop reporting a pending update with
 * StateFlags bit 4 set. Bit 4 alone is never completion (StateFlags 6 = installed + update
 * required, RESEARCH Pitfall 6). A build different from the hand-off's starting build also
 * completes (a short update can finish before any pending state is seen). No update activity within
 * STEAM_REQUEST_NO_ACTIVITY_TICKS ends the poll quietly, invalidating the cached update state, and
 * completes instead only when the ACF is current at the target build (or no target is known). A known
 * target different from the starting build must be reached before the poll reports finished. is_installed is never changed here.
 */
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { getFileSize } from 'backend/utils'
import type { ManagerDeps } from 'backend/services/types'
import { liveProgress } from '../steamDownloadProgress'
import { invalidateSteamUpdateState } from '../updateDetection'
import {
  readAcfUpdateState,
  isAcfUpdatePending,
  STATE_FLAG_FULLY_INSTALLED
} from './acfUpdateState'
import {
  STEAM_INSTALLAPP_RETRY_EVERY_TICKS,
  STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS,
  STEAM_REQUEST_NO_ACTIVITY_TICKS,
  STEAM_UPDATE_ABANDONED_TICKS
} from './pollState'
import {
  createSteamInstallAppRun,
  requestSteamInstallApp
} from '../steamInstallApp'
import type { ActiveInstallPoll } from './pollState'
import { stopInstallPolling } from './installStop'

const STATE_FLAGS_RUNNING = 0x100 | 0x400

/** UAT 19 (74-30): retry InstallApp on the existing tick while armed; bounded, never overlapping,
 *  no new timer (sidecar exit contract). Steam flagging the update as required (StateFlags 6,
 *  TargetBuildID set, nothing downloaded; AutoUpdateBehavior 1) is exactly when InstallApp must
 *  run, so only real activity disarms the retry (UAT 25). */
async function retryInstallApp(
  deps: ManagerDeps,
  appId: string,
  poll: ActiveInstallPoll,
  awaiting: NonNullable<ActiveInstallPoll['awaitingUpdate']>
): Promise<void> {
  const retry = awaiting.installAppRetry
  const sinceHandoff = poll.ticks - poll.delegatedSinceTick
  if (
    !retry ||
    retry.inFlight ||
    awaiting.sawActivity ||
    sinceHandoff <= 0 ||
    sinceHandoff % STEAM_INSTALLAPP_RETRY_EVERY_TICKS !== 0
  ) {
    return
  }
  retry.inFlight = true
  try {
    const outcome = await requestSteamInstallApp(
      appId,
      { libraryPath: retry.libraryPath },
      {
        paths: deps.paths,
        run: createSteamInstallAppRun({ runner: deps.runner })
      }
    )
    if (outcome.kind === 'ok') {
      logInfo(
        `SteamGame: Steam is updating appId ${appId} via InstallApp (retry after Steam start)`,
        LogPrefix.Steam
      )
      delete awaiting.installAppRetry
      poll.delegatedSinceTick = poll.ticks
    } else if (outcome.kind === 'error') {
      logError(
        `SteamGame: Steam refused InstallApp update retry for appId ${appId} (EAppUpdateError ${outcome.code})`,
        LogPrefix.Steam
      )
      delete awaiting.installAppRetry
    } else {
      retry.attempts++
      if (retry.attempts >= STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS) {
        logInfo(
          `SteamGame: InstallApp retry for appId ${appId} gave up after ${retry.attempts} attempts (${outcome.reason})`,
          LogPrefix.Steam
        )
        delete awaiting.installAppRetry
      }
    }
  } catch (e) {
    logError(
      `SteamGame: InstallApp retry for appId ${appId} threw: ${String(e)}`,
      LogPrefix.Steam
    )
    delete awaiting.installAppRetry
  } finally {
    retry.inFlight = false
  }
}

export async function pollUpdateOnce(
  deps: ManagerDeps,
  appId: string,
  poll: ActiveInstallPoll
): Promise<void> {
  const awaiting = poll.awaitingUpdate
  if (!awaiting) return
  const fields = await readAcfUpdateState(deps, appId, poll.source)

  const complete = (done: { buildid: string }, verb: string): void => {
    const existing = deps.steamSession.libraryState.library.get(appId)
    logInfo(
      `Steam: update of appId ${appId} ${verb} (build ${done.buildid})`,
      LogPrefix.Steam
    )
    void stopInstallPolling(deps, appId)
    invalidateSteamUpdateState(deps, appId)
    if (existing) deps.sendFrontendMessage('pushGameToLibrary', existing)
    // libraryState only drops a game from gameUpdates on a done that follows updating, and a 3 s
    // Steam update can finish before any progress tick sent 'updating' (74 UAT 12).
    deps.sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'updating',
      managedBySteam: true
    })
    deps.sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
  }

  // Not finished: the badge stays because the cached update state is re-read, not cleared.
  const endQuietly = (message: string): void => {
    logInfo(message, LogPrefix.Steam)
    void stopInstallPolling(deps, appId)
    invalidateSteamUpdateState(deps, appId)
    deps.sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
  }

  if (fields) {
    const pending = isAcfUpdatePending(fields)
    if (pending) awaiting.sawPending = true
    const atStaleStart =
      awaiting.targetBuild !== undefined &&
      fields.buildid === awaiting.fromBuild &&
      fields.buildid !== awaiting.targetBuild
    const growing =
      poll.lastBytesDownloaded !== undefined &&
      fields.bytesDownloaded > poll.lastBytesDownloaded
    if (
      (fields.stateFlags & STATE_FLAGS_RUNNING) !== 0 ||
      ((fields.stateFlags & 0x2) !== 0 && growing)
    ) {
      awaiting.sawActivity = true
    }

    if (
      !pending &&
      !atStaleStart &&
      (fields.stateFlags & STATE_FLAG_FULLY_INSTALLED) !== 0 &&
      (awaiting.sawPending ||
        awaiting.sawActivity ||
        // a stale target always differs from fromBuild, so this also covers reaching the target
        fields.buildid !== awaiting.fromBuild)
    ) {
      complete(fields, 'finished')
      return
    }

    // WR-01: activity was seen, then the ACF settled back at the starting build with a known
    // newer target. Steam dropped the update; without this the poll runs to MAX_TICKS (~6 h).
    // Consecutive ticks only, so a brief settled read mid-update does not end it.
    if (
      awaiting.sawActivity &&
      atStaleStart &&
      !pending &&
      (fields.stateFlags & STATE_FLAG_FULLY_INSTALLED) !== 0 &&
      (fields.stateFlags & STATE_FLAGS_RUNNING) === 0
    ) {
      awaiting.settledAtStartTicks = (awaiting.settledAtStartTicks ?? 0) + 1
      if (awaiting.settledAtStartTicks >= STEAM_UPDATE_ABANDONED_TICKS) {
        endQuietly(
          `Steam: update of appId ${appId} settled back at build ${awaiting.fromBuild} for ${STEAM_UPDATE_ABANDONED_TICKS} ticks; ending the update poll quietly`
        )
        return
      }
    } else {
      awaiting.settledAtStartTicks = 0
    }

    const live =
      isMac && poll.source === 'native'
        ? deps.steamProcesses.downloadMonitor.read(appId)
        : undefined
    const liveP = live
      ? liveProgress({
          downloadDone: live.bytesDone,
          downloadTotal: live.bytesTotal,
          cumAtStart: 0,
          cumNow: 0,
          acfBytesDownloaded: fields.bytesDownloaded,
          acfBytesToDownload: fields.bytesToDownload
        })
      : undefined
    const done = liveP ? liveP.bytesDone : fields.bytesDownloaded
    const total = liveP ? liveP.total : fields.bytesToDownload
    poll.lastBytesDownloaded = fields.bytesDownloaded

    deps.sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'updating',
      managedBySteam: true
    })
    if (total > 0) {
      const raw = (done / total) * 100
      if (Number.isFinite(raw)) {
        deps.sendFrontendMessage('progressUpdate', {
          appName: appId,
          runner: 'steam',
          status: 'updating',
          progress: {
            percent: Math.min(99, Math.max(0, Math.round(raw))),
            bytes: getFileSize(done),
            eta: ''
          }
        })
      }
    }
  }

  await retryInstallApp(deps, appId, poll, awaiting)

  if (
    !awaiting.sawActivity &&
    poll.ticks - poll.delegatedSinceTick >= STEAM_REQUEST_NO_ACTIVITY_TICKS
  ) {
    if (
      fields &&
      !isAcfUpdatePending(fields) &&
      (fields.stateFlags & STATE_FLAG_FULLY_INSTALLED) !== 0 &&
      (awaiting.targetBuild === undefined ||
        fields.buildid === awaiting.targetBuild)
    ) {
      complete(fields, 'finished')
      return
    }
    endQuietly(
      `Steam: no update activity for appId ${appId} within ${STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks; ending the update poll quietly`
    )
  }
}
