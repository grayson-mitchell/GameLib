/**
 * Phase 81 D-14: the Play-time adoption gate, on macOS, Windows and Linux.
 *
 * A GameLib-downloaded native install the running Steam never adopted makes `steam://rungameid`
 * open Steam's install dialog (quick 261029-ji2). While a pending-adoption record exists, Play
 * consults the Rust adoption read first and then either launches as usual, restarts Steam once
 * (graceful `steam://exit`, bounded wait, relaunch through `steam://rungameid/<id>`), or, when
 * Steam is running but signed out (D-03), opens Steam instead.
 *
 * D-04: there is no confirmation prompt; the existing 'steam-starting' status shows while Steam
 * restarts. D-05: in the refused cases (a game running in Steam, a sign-in or go-offline wrap owed,
 * Steam not quitting in 30 s) Play never falls back to a plain rungameid launch and the record
 * stays. D-06: the launch-without-Steam setting short-circuits at dispatchSteamLaunch, so this
 * gate never runs for it. Steam is never signalled or killed.
 *
 * Exit contract: no timers or handles of its own; the restart sleeps run on the unref'd clock.
 */
import i18next from 'i18next'
import { isMac, isWindows } from 'backend/constants/environment'
import { notify } from 'backend/dialog/dialog'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendGameStatusUpdate } from 'backend/utils'
import {
  clearAndUnwatchPendingAdoption,
  readSteamAdoption
} from './adoptionWatch'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import type SteamGame from './games'
import {
  createRestartDeps,
  decidePlayAdoption,
  pendingAdoptionStoreFrom,
  probeSteamPid,
  readAcfSnapshot,
  readPendingAdoption,
  restartSteamForAdoption
} from './macSteamAdoption'
import { watchSteamLaunch } from './steamLaunchedDeps'

/**
 * 'proceed': the caller goes on with its plain launch. 'launched': Steam was restarted and
 * relaunched the game. 'opened-steam': Steam was brought forward (signed out), nothing launched.
 * 'refused': the restart was refused and the user was told; nothing launched.
 */
export type PlayGateResult = 'proceed' | 'launched' | 'opened-steam' | 'refused'

/** The host OS as a Node platform name (read per call: tests flip the environment flags). */
export function hostPlatform(): NodeJS.Platform {
  if (isMac) return 'darwin'
  if (isWindows) return 'win32'
  return 'linux'
}

export async function gatePlayOnAdoption(
  steamGame: SteamGame,
  platform: NodeJS.Platform = hostPlatform()
): Promise<PlayGateResult> {
  const { deps, appId } = steamGame
  const record = readPendingAdoption(appId, pendingAdoptionStoreFrom(deps))
  if (!record) return 'proceed'

  const currentPid = await probeSteamPid(
    { runner: deps.runner },
    platform
  ).catch(() => null)
  const reading = await readSteamAdoption(deps, appId, record)
  // The ACF is only read when the Rust read failed (D-10, today's rules).
  const currentAcf = reading
    ? null
    : await readAcfSnapshot(deps, record.manifestPath)
  const decision = decidePlayAdoption({
    record,
    platform,
    reading,
    currentPid,
    currentAcf
  })

  if (decision === 'clear-and-launch') {
    clearAndUnwatchPendingAdoption(deps, appId)
    return 'proceed'
  }

  if (decision === 'unknown') {
    // WR-01 (75 review): never quit Steam on an unread ACF; record kept.
    logWarning(
      `SteamGame: Play for ${appId}: manifest unreadable, adoption unknown; launching without a Steam restart (pending adoption kept)`,
      LogPrefix.Steam
    )
    return 'proceed'
  }

  if (decision === 'open-steam') {
    // D-03: a signed-out Steam cannot adopt anything and a restart would not help. Bring it
    // forward (no activate:false) so the user can sign in; the record stays.
    logInfo(
      `SteamGame: Play for ${appId}: Steam is running but signed out; opening Steam (pending adoption kept)`,
      LogPrefix.Steam
    )
    await deps.openExternal.openExternal('steam://open/main')
    sendGameStatusUpdate(deps, {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
    return 'opened-steam'
  }

  if (decision !== 'restart') return 'proceed'

  const url = buildSteamProtocolUrl('rungameid', appId)
  if (!url) return 'refused'
  const outcome = await restartSteamForAdoption(
    appId,
    createRestartDeps({
      platform,
      requestRustInvoke: deps.requestRustInvoke,
      runner: deps.runner,
      openExternal: deps.openExternal,
      clock: deps.clock,
      paths: deps.paths,
      macSteam: deps.steamProcesses.macSteam,
      sendFrontendMessage: deps.sendFrontendMessage,
      appRuntime: deps.appRuntime,
      relaunch: () => deps.openExternal.openExternal(url, { activate: false })
    })
  )
  if (outcome.kind === 'relaunched') {
    clearAndUnwatchPendingAdoption(deps, appId)
    watchSteamLaunch(deps, appId)
    return 'launched'
  }

  // Refuse rather than fall back to a plain launch: an unadopted install in a running Steam
  // opens the install dialog (the failure being removed), and quitting would end the user's game
  // session. Steam is never killed; the record stays pending (D-05).
  const game = steamGame.getGameInfo().title
  const body =
    outcome.kind === 'game-running'
      ? i18next.t(
          'gamelib:steam.adoptRestart.gameRunning',
          'Quit the game running in Steam, then press Play to finish setting up {{game}}.',
          { game }
        )
      : outcome.kind === 'steam-busy'
        ? i18next.t(
            'gamelib:steam.adoptRestart.busy',
            'Steam is busy with a GameLib sign-in. Try Play again in a moment.'
          )
        : i18next.t(
            'gamelib:steam.adoptRestart.quitTimeout',
            "Steam didn't quit, so {{game}} couldn't be set up. Quit Steam and press Play again.",
            { game }
          )
  logWarning(
    `SteamGame: Play for ${appId} not launched (${outcome.kind}); pending adoption kept`,
    LogPrefix.Steam
  )
  notify(deps, { title: game, body })
  return 'refused'
}
