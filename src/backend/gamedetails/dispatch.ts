/**
 * Game-details dispatch handler bodies (Phase 34.2, D-01/D-03/D-08).
 *
 * These back `main.ts`'s `addHandler`/`addListener` registrations for the
 * game-details/settings/overrides IPC slice with byte-identical bodies,
 * extracted so the Node sidecar can import the same behavior the Electron
 * build runs (single source of truth). `main.ts` keeps each registration
 * line as a one-line delegation to one of these exports.
 *
 * MUST NOT import `electron`, `backend/ipc`, `../ipc`, `../launcher`, or
 * `main_window` DIRECTLY -- the Node sidecar imports this module directly,
 * and `gameDetailsImportGate.test.ts`'s comment-stripped gates enforce this.
 * Transitive reach to `electron` DOES exist here and is EXPECTED -- this
 * file's own `import { notify } from '../dialog/dialog'` below reaches
 * `dialog.ts`'s `import { dialog, Notification } from 'electron'` -- and is
 * safe at runtime because `platformApi`'s `Module._load` interception
 * (`sidecar/platform/index.ts`) rewrites every `require('electron')` inside
 * the sidecar process. See `sidecar/__tests__/electronReachLedger.test.ts`
 * for the measured, enforced set of electron-importing modules actually
 * reachable from this slice's four gated entry points.
 *
 * 19-channel reconciliation for this slice: 15 bodies live here, 1
 * (`setGameMetadataOverride`) lives in `./overrides`, 2
 * (`getGameMetadataOverride`/`getAllGameOverrides`) are already bare
 * pass-throughs to `game_overrides/index.ts` and were never extracted, and 1
 * (`getKnownFixes`) is plan 34.2-03's `knownFixes.ts`.
 *
 * D-01 declaration rider: for the Steam runner, `repair`,
 * `changeGameVersionPinnedStatus`, `changeInstallPath`, and `getLaunchOptions`
 * are upstream stubs in Electron ALREADY -- `SteamGame.repair()` logs
 * "SteamGame.repair not implemented until Phase 2"
 * (`storeManagers/steam/games.ts:1610`), and
 * `SteamLibrary.changeGameInstallPath` (`library.ts:790`),
 * `changeVersionPinnedStatus` (`library.ts:797`) and `getLaunchOptions`
 * (`library.ts:907`) are underscore-arg no-ops. Porting them faithfully is
 * correct; a later reader must not misdiagnose them as this phase's
 * regression.
 */

import type { FrontendMessageDeps } from '../host/frontendMessage'
import i18next from 'i18next'

import type {
  ExtraInfo,
  GameInfo,
  GameSettings,
  InstallInfo,
  InstallPlatform,
  LaunchOption,
  MoveGameArgs,
  Runner
} from 'common/types'
import type { GameOverride, SelectiveDownload } from 'common/types/legendary'
import { isStore, storeCapabilities } from 'common/storeCapabilities'

import type { Stores, StoreManagers, ManagerDeps } from '../services/types'
import { attachOverrides, type GameOverridesDeps } from '../game_overrides'
import { isDelegatedInstallPolling } from '../storeManagers/steam/library/installPolling'
import type { InstallPollState } from '../storeManagers/steam/library/pollState'
import type { AbortRegistry } from '../utils/aborthandler/aborthandler'
import type { OnlineMonitor } from '../online_monitor'
import { sendGameStatusUpdate } from '../utils'
import { notify, type NotifyDeps } from '../dialog/dialog'
import { LegendaryUser } from '../storeManagers/legendary/user'
import { logError, logInfo, logWarning, LogPrefix } from '../logger'

/** What the game-details dispatchers read: the manager map and the kvs config store (66.1, R3). */
export interface GameDetailsDeps extends NotifyDeps, FrontendMessageDeps {
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  managers: Pick<StoreManagers, 'library'>
  /** The boot-owned abort registry a kill signals through (66.4-13). */
  aborts: Pick<AbortRegistry, 'call'>
  steamInstallRuntime: { polls: Pick<InstallPollState, 'activePolls'> }
  /** The path roots the Epic user-info read derives from (66.4-11). */
  paths: Pick<ManagerDeps['paths'], 'appFolder' | 'toolsPath'>
  stores: {
    kvs: Pick<Stores['kvs'], 'configStore'>
  } & GameOverridesDeps['stores']
}

export async function isGameAvailable(
  deps: GameDetailsDeps,
  args: {
    appName: string
    runner: Runner
  }
): Promise<boolean> {
  const { appName, runner } = args
  return deps.managers.library[runner].getGame(appName).isGameAvailable()
}

export async function getGameInfo(
  deps: GameDetailsDeps,
  appName: string,
  runner: Runner
): Promise<GameInfo | null> {
  // Fastpath since we sometimes have to request info for a GOG game as Legendary because we don't know it's a GOG game yet
  if (
    isStore(runner, 'legendary') &&
    !deps.managers.library['legendary'].hasGame(appName)
  ) {
    return null
  }
  const tempGameInfo = deps.managers.library[runner]
    .getGame(appName)
    .getGameInfo()
  // The game managers return an empty object if they couldn't fetch the game
  // info, since most of the backend assumes getting it can never fail (and
  // an empty object is a little easier to work with than `null`)
  // The frontend can however handle being passed an explicit `null` value, so
  // we return that here instead if the game info is empty
  if (!Object.keys(tempGameInfo).length) return null
  return attachOverrides(deps, tempGameInfo)
}

export async function getExtraInfo(
  deps: GameDetailsDeps,
  appName: string,
  runner: Runner
): Promise<ExtraInfo | null> {
  // Fastpath since we sometimes have to request info for a GOG game as Legendary because we don't know it's a GOG game yet
  if (
    isStore(runner, 'legendary') &&
    !deps.managers.library['legendary'].hasGame(appName)
  ) {
    return null
  }
  return deps.managers.library[runner].getGame(appName).getExtraInfo()
}

export async function getGameSettings(
  deps: GameDetailsDeps,
  appName: string,
  runner: Runner
): Promise<GameSettings | null> {
  try {
    return await deps.managers.library[runner].getGame(appName).getSettings()
  } catch (error) {
    logError(error, LogPrefix.Backend)
    return null
  }
}

// F-34.5-G6-10 (34.5-43): moved verbatim from main.ts:844-863 -- a real
// preload channel that was registered ONLY on the Electron side until this
// port. Parameter order is build THEN branch, the order both real ends
// (frontend/helpers/index.ts:88, main.ts:844) already agree on; ipc.ts's
// declared parameter NAMES disagreed and are corrected in this same plan.
export async function getInstallInfo(
  deps: GameDetailsDeps,
  appName: string,
  runner: Runner,
  installPlatform: InstallPlatform,
  build?: string,
  branch?: string
): Promise<InstallInfo | null> {
  try {
    const info = await deps.managers.library[runner].getInstallInfo(
      appName,
      installPlatform,
      {
        branch,
        build
      }
    )
    if (info === undefined) return null
    return info
  } catch (error) {
    logError(
      error,
      isStore(runner, 'legendary') ? LogPrefix.Legendary : LogPrefix.Gog
    )
    return null
  }
}

export async function kill(
  deps: GameDetailsDeps,
  appName: string,
  runner: Runner
): Promise<void> {
  // A Steam-owned (delegated) install has no abort controller by design;
  // SteamGame.stop() -> cancelDelegatedInstall ends it, and a lookup here
  // would log a false "Aborting not possible" ERROR (quick 261106-pvk).
  if (
    !(
      storeCapabilities[runner].installManagedExternally &&
      isDelegatedInstallPolling(deps, appName)
    )
  ) {
    deps.aborts.call(appName)
  }
  return deps.managers.library[runner].getGame(appName).stop()
}

// SteamGame.repair() (storeManagers/steam/games.ts) restores a bridge title's
// steam_api originals (quick 261026-lif); a throw from it surfaces below as
// "Error Repairing".
//
// The two `i18next.t(...)` calls below are the sites plan 34.2-01's D-02
// bootstrap init exists to make return real strings under the sidecar.
export async function repair(
  deps: GameDetailsDeps,
  appName: string,
  runner: Runner
): Promise<void> {
  if (!deps.onlineMonitor.isOnline()) {
    logWarning(
      `App offline, skipping repair for game '${appName}'.`,
      LogPrefix.Backend
    )
    return
  }

  sendGameStatusUpdate(deps, {
    appName,
    runner,
    status: 'repairing'
  })

  const { title } = deps.managers.library[runner].getGame(appName).getGameInfo()

  // IN-02 (34.2-REVIEW.md round 1): the success notification and
  // "Finished repairing" log used to sit AFTER the try/catch, unguarded, so a
  // failed repair notified "Error Repairing" and then immediately notified
  // "finished" and logged success. Two consequences, the second the reason
  // this is not cosmetic:
  //
  //   1. The user is told the repair both failed and finished.
  //   2. The `catch` swallows the error without rethrowing, so the invoke
  //      RESOLVES. `GameSubMenu/index.tsx:150-155` wraps `repair()` in a
  //      try/catch whose handler is `reportRepairFailure()` -- gap cycle 2's
  //      CR-01 renderer half, with its three failure signals and the
  //      T-34.2-52 disclosure guard. That handler could therefore never fire
  //      for an actual runner-level repair failure, only for a transport one.
  //
  // Shape mirrors `moveInstall` (main.ts:1113-1156), the correct sibling in
  // this codebase: the success notification is gated on the error path not
  // having been taken, while `status: 'done'` stays UNCONDITIONAL -- it is
  // what clears the renderer's `repairing` spinner, so a failed repair must
  // still send it or the card stays stuck.
  //
  // The flag, rather than moving the success notify inside the `try`, keeps a
  // throwing `notify()` from being mistaken for a repair failure.
  let repairFailed = false

  try {
    await deps.managers.library[runner].getGame(appName).repair()
  } catch (error) {
    repairFailed = true
    notify(deps, {
      title,
      body: i18next.t('notify.error.reparing', 'Error Repairing')
    })
    logError(error, LogPrefix.Backend)
  }

  if (!repairFailed) {
    notify(deps, { title, body: i18next.t('notify.finished.reparing') })
    logInfo('Finished repairing', LogPrefix.Backend)
  }

  sendGameStatusUpdate(deps, {
    appName,
    runner,
    status: 'done'
  })
}

// D-01 declaration rider: SteamLibrary.changeGameInstallPath is an
// underscore-arg no-op (library.ts:790) -- an upstream Electron-side stub,
// not a regression introduced here.
export async function changeInstallPath(
  deps: GameDetailsDeps,
  args: MoveGameArgs
): Promise<void> {
  const { appName, path, runner } = args
  await deps.managers.library[runner].changeGameInstallPath(appName, path)
  logInfo(
    `Finished changing install path of ${appName} to ${path}.`,
    LogPrefix.Backend
  )
}

// D-01 declaration rider: SteamLibrary.getLaunchOptions is an underscore-arg
// no-op (library.ts:907) -- an upstream Electron-side stub, not a
// regression introduced here.
export async function getLaunchOptions(
  deps: GameDetailsDeps,
  appName: string,
  runner: Runner
): Promise<LaunchOption[]> {
  const availableLaunchOptions =
    await deps.managers.library[runner].getLaunchOptions(appName)

  // add a default option if there are other options but no default
  if (
    availableLaunchOptions.length > 0 &&
    !availableLaunchOptions.some(
      (option) =>
        (option.type === undefined || option.type === 'basic') &&
        option.name === 'Default' &&
        option.parameters === ''
    )
  ) {
    availableLaunchOptions.unshift({
      name: i18next.t('launch.default', 'Default', {
        ns: 'gamepage'
      }),
      parameters: '',
      type: 'basic'
    })
  }

  return availableLaunchOptions
}

// D-01 declaration rider: SteamLibrary.changeVersionPinnedStatus is an
// underscore-arg no-op (library.ts:797) -- an upstream Electron-side stub,
// not a regression introduced here.
export function changeGameVersionPinnedStatus(
  deps: GameDetailsDeps,
  appName: string,
  runner: Runner,
  status: boolean
): void {
  deps.managers.library[runner].changeVersionPinnedStatus(appName, status)
}

export async function getGameOverride(
  deps: GameDetailsDeps
): Promise<GameOverride> {
  return deps.managers.library['legendary'].getGameOverride()
}

export async function getGameSdl(
  deps: GameDetailsDeps,
  appName: string
): Promise<SelectiveDownload[]> {
  return deps.managers.library['legendary'].getGameSdl(appName)
}

export async function readConfig(
  deps: GameDetailsDeps,
  configClass: 'library' | 'user'
): Promise<GameInfo[] | string> {
  if (configClass === 'library') {
    await deps.managers.library['legendary'].refresh()
    return deps.managers.library['legendary'].getListOfGames()
  }
  const userInfo = LegendaryUser.getUserInfo(deps)
  return userInfo?.displayName ?? ''
}

export function addNewApp(deps: GameDetailsDeps, args: GameInfo): void {
  deps.managers.library['sideload'].addNewApp(args)
}

export async function getAvailableCyberpunkMods(
  deps: GameDetailsDeps
): Promise<string[]> {
  return deps.managers.library['gog'].getCyberpunkMods()
}

export async function setCyberpunkModConfig(
  deps: GameDetailsDeps,
  props: {
    enabled: boolean
    modsToLoad: string[]
  }
): Promise<void> {
  return deps.managers.library['gog'].setCyberpunkModConfig(props)
}
