/**
 * Update for a Steam-registered game (Phase 74, D-12): ask Steam to do it. With the opt-in macOS
 * InstallApp setting on, the running client is asked through the existing helper; otherwise (or
 * when InstallApp is unavailable) the game's page in the Steam library is opened, where Steam shows
 * its Update button. The ACF only learns of an update once Steam runs, so a PICS-stale registered
 * game with Steam closed is handed off (the steam:// link or InstallApp starts Steam) rather than
 * reported current. Either way GameLib then polls the ACF so progress shows as "Updating…" (D-11).
 */
import i18next from 'i18next'
import type { InstallResult } from 'common/types/game_manager'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type SteamGame from './games'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import { isSteamExperimentalInstallAppEnabled } from './experimentalInstallAppSetting'
import {
  createSteamInstallAppRun,
  requestSteamInstallApp
} from './steamInstallApp'
import { resolveSteamLibraryRoot } from './installLocation'
import { readRunningAppId } from './library/runningPoll'
import {
  readAcfUpdateState,
  isAcfUpdatePending,
  STATE_FLAG_FULLY_INSTALLED
} from './library/acfUpdateState'
import { startInstallPolling } from './library/installPolling'
import {
  getLastKnownSteamUpdateState,
  invalidateSteamUpdateState
} from './updateDetection'

// Starts the update-aware poll after the update was already handed to Steam
// (InstallApp or the steam:// link). True when that poll owns the terminal
// status; then the queue sends no 'done' of its own. When the poll does not
// watch an update this is false and the queue sends 'done' as before.
// The answer comes from the start itself (80-REVIEW C-WR-03): a separate
// status read could miss a poll that already finished and double the 'done'.
// The hand-off has happened, so a rejected start is logged and reported as
// not owned, never turned into an error for a running Steam update.
async function startUpdatePoll(
  deps: SteamGame['deps'],
  appId: string,
  pollOptions: Parameters<typeof startInstallPolling>[2]
): Promise<boolean> {
  try {
    return await startInstallPolling(deps, appId, pollOptions)
  } catch (error) {
    logWarning(
      `SteamGame: update poll start failed for appId ${appId} after the Steam hand-off: ${String(error)}`,
      LogPrefix.Steam
    )
    return false
  }
}

export async function updateRegisteredSteamGame(
  steamGame: SteamGame
): Promise<InstallResult> {
  const { deps, appId } = steamGame

  const runningAppId = await readRunningAppId(deps)
  if (runningAppId !== 0 && String(runningAppId) === appId) {
    return {
      status: 'error',
      error: i18next.t(
        'gamelib:steam.update.refusedRunning',
        'Close the game before updating it.'
      )
    }
  }

  const url = buildSteamProtocolUrl('details', appId)
  if (url === null) {
    return { status: 'error', error: `Invalid Steam appId ${appId}` }
  }

  const acfFields = await readAcfUpdateState(deps, appId, 'native').catch(
    () => null
  )
  const known = getLastKnownSteamUpdateState(deps, appId)
  const picsSaysNewer =
    known?.targetBuild !== undefined && known.targetBuild !== acfFields?.buildid
  if (
    acfFields &&
    !isAcfUpdatePending(acfFields) &&
    (acfFields.stateFlags & STATE_FLAG_FULLY_INSTALLED) !== 0 &&
    !picsSaysNewer
  ) {
    logInfo(
      `SteamGame: appId ${appId} is already current (build ${acfFields.buildid}); nothing to hand to Steam`,
      LogPrefix.Steam
    )
    invalidateSteamUpdateState(deps, appId)
    return { status: 'done' }
  }
  if (acfFields && !isAcfUpdatePending(acfFields) && picsSaysNewer) {
    logInfo(
      `SteamGame: appId ${appId} ACF says current (build ${acfFields.buildid}) but Steam has build ${known?.targetBuild}; handing the update to Steam`,
      LogPrefix.Steam
    )
  }
  const fromBuild = acfFields?.buildid ?? ''
  // UAT 19: with Steam closed the ACF's TargetBuildID just equals buildid until Steam itself sees
  // the update, so on the ACF-says-current path the PICS target is the only real one.
  const acfPending = acfFields !== null && isAcfUpdatePending(acfFields)
  // WR-02: a pending ACF can still carry TargetBuildID == buildid (pending through StateFlags bit 2
  // alone); that is no target, and recording it as one leaves the poll's stale-start guard inert.
  const acfTarget =
    acfFields?.targetBuildId &&
    acfFields.targetBuildId !== '0' &&
    acfFields.targetBuildId !== acfFields.buildid
      ? acfFields.targetBuildId
      : undefined
  const targetBuild =
    picsSaysNewer && !acfPending
      ? known?.targetBuild
      : (acfTarget ?? known?.targetBuild)
  const awaitingUpdate: {
    fromBuild: string
    targetBuild: string | undefined
    installAppRetry?: { libraryPath?: string; attempts: number }
  } = { fromBuild, targetBuild }
  const pollOptions = { delegatedToSteamClient: true, awaitingUpdate }

  if (isSteamExperimentalInstallAppEnabled(deps.config)) {
    const libraryPath = await resolveSteamLibraryRoot(deps, undefined).catch(
      () => undefined
    )
    const outcome = await requestSteamInstallApp(
      appId,
      { libraryPath },
      {
        paths: deps.paths,
        run: createSteamInstallAppRun({ runner: deps.runner })
      }
    )
    if (outcome.kind === 'ok') {
      logInfo(
        `SteamGame: Steam is updating appId ${appId} via InstallApp`,
        LogPrefix.Steam
      )
      return {
        status: 'done',
        handedOffToSteam: await startUpdatePoll(deps, appId, pollOptions)
      }
    }
    if (outcome.kind === 'error') {
      logError(
        `SteamGame: Steam refused InstallApp update for appId ${appId} (EAppUpdateError ${outcome.code})`,
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Steam refused the update of ${appId} (EAppUpdateError ${outcome.code})`
      }
    }
    logInfo(
      `SteamGame: InstallApp unavailable for appId ${appId} (${outcome.reason}) — handing the update off to the Steam client`,
      LogPrefix.Steam
    )
    // UAT 19 minor: Steam was closed, so retry InstallApp on the poll tick once it is up.
    awaitingUpdate.installAppRetry = { libraryPath, attempts: 0 }
  }

  logInfo(
    `SteamGame: delegating update for appId ${appId} via ${url}`,
    LogPrefix.Steam
  )
  await deps.openExternal.openExternal(url)
  return {
    status: 'done',
    handedOffToSteam: await startUpdatePoll(deps, appId, pollOptions)
  }
}
