/**
 * Verify for a Steam-registered game (quick 261120-p2j): ask the running Mac Steam to
 * StartValidatingApp through the bridge helper (silent, no Steam window; spike 069), and hold
 * until Steam's own app state says the validation finished. A validate never moves the ACF
 * (StateFlags stay 4, only TargetBuildID flips), so the ACF / steampoll pollers cannot see it end;
 * the helper's IPC app-state wait is the completion signal, and dispatch.repair() already holds
 * 'repairing' while `game.repair()` is pending. When the helper cannot reach Steam (closed, Intel
 * Mac, non-macOS, unverified slot) the game's `steam://validate/<appId>` link is opened instead
 * and the result is marked handed-off so no "Finished Repairing" toast claims a repair.
 *
 * Exit contract: this module creates no timers or handles. The helper child is bounded by its own
 * 6 h cap plus a finite runner timeout, and runs under a `deps.aborts` signal that stdin-EOF
 * release aborts.
 */
import type { ExecResult } from 'common/types'
import { logInfo, LogPrefix } from 'backend/logger'
import type SteamGame from './games'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import {
  createSteamInstallAppRun,
  requestSteamValidateApp
} from './steamInstallApp'
import { readRunningAppId } from './library/runningPoll'

// EAppState bits that mean Steam still reports a problem with the files.
const STATE_FILES_MISSING = 0x20
const STATE_FILES_CORRUPT = 0x80

export async function validateRegisteredSteamGame(
  steamGame: SteamGame
): Promise<ExecResult> {
  const { deps, appId } = steamGame
  const title = steamGame.getGameInfo().title

  const runningAppId = await readRunningAppId(deps)
  if (runningAppId !== 0 && String(runningAppId) === appId) {
    throw new Error(`Quit ${title} before verifying it.`)
  }

  const reused =
    deps.aborts.has(appId) && deps.aborts.getSignal(appId)?.aborted === false
  const signal = reused
    ? deps.aborts.getSignal(appId)
    : deps.aborts.create(appId).signal
  try {
    const outcome = await requestSteamValidateApp(
      appId,
      { wait: true, signal },
      {
        paths: deps.paths,
        run: createSteamInstallAppRun({ runner: deps.runner })
      }
    )

    if (outcome.kind === 'ok' && outcome.tracked && outcome.finished) {
      const state = outcome.installState
      if (
        state !== null &&
        (state & (STATE_FILES_MISSING | STATE_FILES_CORRUPT)) !== 0
      ) {
        throw new Error(
          `Steam reports files still missing or corrupt for ${title}`
        )
      }
      logInfo(
        `SteamGame: Steam finished validating appId ${appId} (installState ${String(state)})`,
        LogPrefix.Steam
      )
      return {
        stdout: `Steam finished verifying ${title} (installState ${String(state)})`,
        stderr: ''
      }
    }
    if (outcome.kind === 'ok') {
      logInfo(
        `SteamGame: validate of appId ${appId} handed to Steam (${outcome.reason ?? 'untracked'})`,
        LogPrefix.Steam
      )
      return {
        stdout: `Steam is verifying ${title}`,
        stderr: '',
        handedOffToSteam: true
      }
    }
    if (outcome.kind === 'refused') {
      throw new Error(`Steam refused to verify ${title}`)
    }

    if (signal?.aborted) {
      return { stdout: '', stderr: '', abort: true }
    }
    const url = buildSteamProtocolUrl('validate', appId)
    if (url === null) throw new Error(`Invalid Steam appId ${appId}`)
    logInfo(
      `SteamGame: validate helper unavailable for appId ${appId} (${outcome.reason}); opening ${url}`,
      LogPrefix.Steam
    )
    await deps.openExternal.openExternal(url)
    return {
      stdout: `Asked Steam to verify ${title}`,
      stderr: '',
      handedOffToSteam: true
    }
  } finally {
    if (!reused && signal && deps.aborts.getSignal(appId) === signal) {
      deps.aborts.delete(appId)
    }
  }
}
