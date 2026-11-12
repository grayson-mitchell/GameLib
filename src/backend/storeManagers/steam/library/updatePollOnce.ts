/**
 * Update-aware poll tick (Phase 74, D-11): watches a Steam-owned update of an installed game.
 * Progress shows as 'updating'; completion needs the ACF to stop reporting a pending update with
 * StateFlags bit 4 set. Bit 4 alone is never completion (StateFlags 6 = installed + update
 * required, RESEARCH Pitfall 6). A build equal to the hand-off's target build also completes (a
 * short update can finish before any pending state is seen). No update activity within
 * STEAM_REQUEST_NO_ACTIVITY_TICKS ends the poll quietly, invalidating the cached update state, and
 * completes instead when the ACF is already current. is_installed is never changed here.
 */
import { logInfo, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { getFileSize } from 'backend/utils'
import type { ManagerDeps } from 'backend/services/types'
import { liveProgress } from '../steamDownloadProgress'
import { invalidateSteamUpdateState } from '../updateDetection'
import { readAcfUpdateState, isAcfUpdatePending } from './acfUpdateState'
import { STEAM_REQUEST_NO_ACTIVITY_TICKS } from './pollState'
import type { ActiveInstallPoll } from './pollState'
import { stopInstallPolling } from './installStop'

const STATE_FLAG_FULLY_INSTALLED = 0x4
const STATE_FLAGS_RUNNING = 0x100 | 0x400

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
    stopInstallPolling(deps, appId)
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

  if (fields) {
    const pending = isAcfUpdatePending(fields)
    if (pending) awaiting.sawPending = true
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
      (fields.stateFlags & STATE_FLAG_FULLY_INSTALLED) !== 0 &&
      (awaiting.sawPending ||
        awaiting.sawActivity ||
        fields.buildid !== awaiting.fromBuild ||
        (awaiting.targetBuild !== undefined &&
          fields.buildid === awaiting.targetBuild))
    ) {
      complete(fields, 'finished')
      return
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

  if (
    !awaiting.sawActivity &&
    poll.ticks - poll.delegatedSinceTick >= STEAM_REQUEST_NO_ACTIVITY_TICKS
  ) {
    if (
      fields &&
      !isAcfUpdatePending(fields) &&
      (fields.stateFlags & STATE_FLAG_FULLY_INSTALLED) !== 0
    ) {
      complete(fields, 'finished')
      return
    }
    logInfo(
      `Steam: no update activity for appId ${appId} within ${STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks; ending the update poll quietly`,
      LogPrefix.Steam
    )
    stopInstallPolling(deps, appId)
    invalidateSteamUpdateState(deps, appId)
    deps.sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
  }
}
