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
 * safe at runtime because `electronStub`'s `Module._load` interception
 * (`sidecar/electronStub.ts`) rewrites every `require('electron')` inside
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

import { libraryManagerMap } from '../storeManagers'
import { attachOverrides } from '../game_overrides'
import { callAbortController } from '../utils/aborthandler/aborthandler'
import { isOnline } from '../online_monitor'
import { sendGameStatusUpdate } from '../utils'
import { notify } from '../dialog/dialog'
import { LegendaryUser } from '../storeManagers/legendary/user'
import { logError, logInfo, logWarning, LogPrefix } from '../logger'

export async function isGameAvailable(args: {
  appName: string
  runner: Runner
}): Promise<boolean> {
  const { appName, runner } = args
  return libraryManagerMap[runner].getGame(appName).isGameAvailable()
}

export async function getGameInfo(
  appName: string,
  runner: Runner
): Promise<GameInfo | null> {
  // Fastpath since we sometimes have to request info for a GOG game as Legendary because we don't know it's a GOG game yet
  if (
    runner === 'legendary' &&
    !libraryManagerMap['legendary'].hasGame(appName)
  ) {
    return null
  }
  const tempGameInfo = libraryManagerMap[runner].getGame(appName).getGameInfo()
  // The game managers return an empty object if they couldn't fetch the game
  // info, since most of the backend assumes getting it can never fail (and
  // an empty object is a little easier to work with than `null`)
  // The frontend can however handle being passed an explicit `null` value, so
  // we return that here instead if the game info is empty
  if (!Object.keys(tempGameInfo).length) return null
  return attachOverrides(tempGameInfo)
}

export async function getExtraInfo(
  appName: string,
  runner: Runner
): Promise<ExtraInfo | null> {
  // Fastpath since we sometimes have to request info for a GOG game as Legendary because we don't know it's a GOG game yet
  if (
    runner === 'legendary' &&
    !libraryManagerMap['legendary'].hasGame(appName)
  ) {
    return null
  }
  return libraryManagerMap[runner].getGame(appName).getExtraInfo()
}

export async function getGameSettings(
  appName: string,
  runner: Runner
): Promise<GameSettings | null> {
  try {
    return await libraryManagerMap[runner].getGame(appName).getSettings()
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
  appName: string,
  runner: Runner,
  installPlatform: InstallPlatform,
  build?: string,
  branch?: string
): Promise<InstallInfo | null> {
  try {
    const info = await libraryManagerMap[runner].getInstallInfo(
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
      runner === 'legendary' ? LogPrefix.Legendary : LogPrefix.Gog
    )
    return null
  }
}

export async function kill(appName: string, runner: Runner): Promise<void> {
  callAbortController(appName)
  return libraryManagerMap[runner].getGame(appName).stop()
}

// D-01 declaration rider: SteamGame.repair() logs "SteamGame.repair not
// implemented until Phase 2" (storeManagers/steam/games.ts:1610) -- this is
// an upstream Electron-side stub, not a regression introduced here.
//
// The two `i18next.t(...)` calls below are the sites plan 34.2-01's D-02
// bootstrap init exists to make return real strings under the sidecar.
export async function repair(appName: string, runner: Runner): Promise<void> {
  if (!isOnline()) {
    logWarning(
      `App offline, skipping repair for game '${appName}'.`,
      LogPrefix.Backend
    )
    return
  }

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'repairing'
  })

  const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()

  try {
    await libraryManagerMap[runner].getGame(appName).repair()
  } catch (error) {
    notify({
      title,
      body: i18next.t('notify.error.reparing', 'Error Repairing')
    })
    logError(error, LogPrefix.Backend)
  }
  notify({ title, body: i18next.t('notify.finished.reparing') })
  logInfo('Finished repairing', LogPrefix.Backend)

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'done'
  })
}

// D-01 declaration rider: SteamLibrary.changeGameInstallPath is an
// underscore-arg no-op (library.ts:790) -- an upstream Electron-side stub,
// not a regression introduced here.
export async function changeInstallPath(args: MoveGameArgs): Promise<void> {
  const { appName, path, runner } = args
  await libraryManagerMap[runner].changeGameInstallPath(appName, path)
  logInfo(
    `Finished changing install path of ${appName} to ${path}.`,
    LogPrefix.Backend
  )
}

// D-01 declaration rider: SteamLibrary.getLaunchOptions is an underscore-arg
// no-op (library.ts:907) -- an upstream Electron-side stub, not a
// regression introduced here.
export async function getLaunchOptions(
  appName: string,
  runner: Runner
): Promise<LaunchOption[]> {
  const availableLaunchOptions =
    await libraryManagerMap[runner].getLaunchOptions(appName)

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
  appName: string,
  runner: Runner,
  status: boolean
): void {
  libraryManagerMap[runner].changeVersionPinnedStatus(appName, status)
}

export async function getGameOverride(): Promise<GameOverride> {
  return libraryManagerMap['legendary'].getGameOverride()
}

export async function getGameSdl(
  appName: string
): Promise<SelectiveDownload[]> {
  return libraryManagerMap['legendary'].getGameSdl(appName)
}

export async function readConfig(
  configClass: 'library' | 'user'
): Promise<GameInfo[] | string> {
  if (configClass === 'library') {
    await libraryManagerMap['legendary'].refresh()
    return libraryManagerMap['legendary'].getListOfGames()
  }
  const userInfo = LegendaryUser.getUserInfo()
  return userInfo?.displayName ?? ''
}

export function addNewApp(args: GameInfo): void {
  libraryManagerMap['sideload'].addNewApp(args)
}

export async function getAvailableCyberpunkMods(): Promise<string[]> {
  return libraryManagerMap['gog'].getCyberpunkMods()
}

export async function setCyberpunkModConfig(props: {
  enabled: boolean
  modsToLoad: string[]
}): Promise<void> {
  return libraryManagerMap['gog'].setCyberpunkModConfig(props)
}
