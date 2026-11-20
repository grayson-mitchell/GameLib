// Maintenance cluster (moveInstall, repair, syncSaves) lifted out of SteamGame (62-08, mechanical this->steamGame).
// Public SteamGame entry points keep a delegating stub on the class; internal
// helpers are called directly by sibling lifted modules (this one may import
// gameEligibility and gameInstall), importing forward only
// (gameEligibility/gameLaunchOverlay -> gameInstall -> gameLaunch ->
// gameBridgeLaunch). A call a test spies on stays a `steamGame.X()` call
// (quick-261107-an2).
import { ExecResult } from 'common/types'
import { GOGCloudSavesLocation } from 'common/types/gog'
import { InstallResult } from 'common/types/game_manager'
import { logWarning, LogPrefix } from 'backend/logger'
import { findBridgeInstallBottle } from './bridgeBottle'
import { readAcfUpdateState } from './library/acfUpdateState'
import { validateRegisteredSteamGame } from './validateNative'
import { verifyBridgeGame } from './verifyBridge'
import type SteamGame from './games'

export async function moveInstall(
  steamGame: SteamGame,
  _newInstallPath: string
): Promise<InstallResult> {
  logWarning(
    `SteamGame.moveInstall not implemented until Phase 2 (appId: ${steamGame.appId})`,
    LogPrefix.Steam
  )
  return {
    status: 'error',
    error: 'Steam library not implemented until Phase 2'
  }
}

// repair() is Verify (quick 261120-p2j), routed like SteamGame.update(): a bridge install runs a
// chunk-level depot verify (verifyBridge.ts); a Steam-registered install asks Mac Steam to
// StartValidatingApp, or opens steam://validate (validateNative.ts); anything else is a Phase 17
// bottle install that verifies inside its own bottle.
export async function repair(steamGame: SteamGame): Promise<ExecResult> {
  // Same route predicates as SteamGame.update(): bridge first, then Steam-registered.
  if (!findBridgeInstallBottle(steamGame.deps.paths, steamGame.appId)) {
    if (
      (await readAcfUpdateState(steamGame.deps, steamGame.appId, 'native')) !==
      null
    ) {
      return validateRegisteredSteamGame(steamGame)
    }
    throw new Error(
      `Steam verifies this game inside its bottle (appId ${steamGame.appId})`
    )
  }
  return verifyBridgeGame(steamGame)
}

export async function syncSaves(
  steamGame: SteamGame,
  _arg: string,
  _path: string,
  _gogSaves?: GOGCloudSavesLocation[]
): Promise<string> {
  logWarning(
    `SteamGame.syncSaves not implemented until Phase 2 (appId: ${steamGame.appId})`,
    LogPrefix.Steam
  )
  return 'Steam library not implemented until Phase 2'
}
