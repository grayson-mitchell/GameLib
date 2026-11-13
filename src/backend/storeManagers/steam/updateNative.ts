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
import { logError, logInfo, LogPrefix } from 'backend/logger'
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

// True when an update-aware poll for appId is registered after the hand-off, so
// the poll (not the queue's 'done') owns the terminal status. If
// startInstallPolling no-opped because a non-update poll already existed this
// is false and the queue sends 'done' as before.
function pollOwnsUpdate(deps: SteamGame['deps'], appId: string): boolean {
  return (
    deps.steamInstallRuntime.polls.activePolls.get(appId)?.awaitingUpdate !==
    undefined
  )
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
  const targetBuild =
    acfFields?.targetBuildId && acfFields.targetBuildId !== '0'
      ? acfFields.targetBuildId
      : known?.targetBuild
  const pollOptions = {
    delegatedToSteamClient: true,
    awaitingUpdate: { fromBuild, targetBuild }
  }

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
      startInstallPolling(deps, appId, pollOptions)
      return { status: 'done', handedOffToSteam: pollOwnsUpdate(deps, appId) }
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
  }

  logInfo(
    `SteamGame: delegating update for appId ${appId} via ${url}`,
    LogPrefix.Steam
  )
  await deps.openExternal.openExternal(url)
  startInstallPolling(deps, appId, pollOptions)
  return { status: 'done', handedOffToSteam: pollOwnsUpdate(deps, appId) }
}
