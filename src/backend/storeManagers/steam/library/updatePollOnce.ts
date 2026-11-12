/**
 * Update-aware poll tick (Phase 74, D-11): watches a Steam-owned update of an installed game.
 * Progress shows as 'updating'; completion needs the ACF to stop reporting a pending update with
 * StateFlags bit 4 set. Bit 4 alone is never completion (StateFlags 6 = installed + update
 * required, RESEARCH Pitfall 6). No update activity within STEAM_REQUEST_NO_ACTIVITY_TICKS ends the
 * poll quietly; is_installed is never changed here.
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
        fields.buildid !== awaiting.fromBuild)
    ) {
      const existing = deps.steamSession.libraryState.library.get(appId)
      logInfo(
        `Steam: update of appId ${appId} finished (build ${fields.buildid})`,
        LogPrefix.Steam
      )
      stopInstallPolling(deps, appId)
      invalidateSteamUpdateState(deps, appId)
      if (existing) deps.sendFrontendMessage('pushGameToLibrary', existing)
      deps.sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
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
    logInfo(
      `Steam: no update activity for appId ${appId} within ${STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks; ending the update poll quietly`,
      LogPrefix.Steam
    )
    stopInstallPolling(deps, appId)
    deps.sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
  }
}
