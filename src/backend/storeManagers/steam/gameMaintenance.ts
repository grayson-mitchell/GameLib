// Maintenance cluster (moveInstall, repair, syncSaves) lifted out of SteamGame (62-08, mechanical this->steamGame).
// Public SteamGame entry points keep a delegating stub on the class; internal
// helpers are called directly by sibling lifted modules (this one may import
// gameEligibility and gameInstall), importing forward only
// (gameEligibility/gameLaunchOverlay -> gameInstall -> gameLaunch ->
// gameBridgeLaunch). A call a test spies on stays a `steamGame.X()` call
// (quick-261107-an2).
import { existsSync } from 'graceful-fs'
import { basename, relative, resolve } from 'node:path'
import { ExecResult } from 'common/types'
import { GOGCloudSavesLocation } from 'common/types/gog'
import { InstallResult } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isBridgeBottleReady, getBridgeBottleSettings } from './bottle'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
import { restoreBridgeSteamApiOriginals } from './bridge/originalRestore'
import { resolveBridgeLaunchExe } from './bridge/launchTarget'
import type SteamGame from './games'
import { resolveBridgeGameInstallRoot } from './gameInstall'

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

export async function repair(steamGame: SteamGame): Promise<ExecResult> {
  const scoped = (): Error =>
    new Error(
      `Repair restores bridge steam_api originals; appId ${steamGame.appId} has no bridge install (a full depot verify is not supported)`
    )
  const exePath = await resolveBridgeLaunchExe(steamGame.appId)
  const bottle = getBridgeBottleSettings(steamGame.appId).wineCrossoverBottle
  if (!exePath || !isBridgeBottleReady(bottle) || !existsSync(exePath)) {
    throw scoped()
  }
  const installRoot = resolveBridgeGameInstallRoot(steamGame, exePath, bottle)
  if (!installRoot) throw scoped()

  const result = await restoreBridgeSteamApiOriginals({
    appId: steamGame.appId,
    bottleDir: resolve(getBottleDir(bottle)),
    installRoot,
    installdir: basename(installRoot)
  })
  const lines = result.outcomes.map((o) => {
    const rel = relative(installRoot, o.path)
    return `${rel}: ${o.outcome}${o.detail ? ` (${o.detail})` : ''}`
  })
  for (const line of lines) {
    logInfo(
      `SteamGame.repair appId ${steamGame.appId}: ${line}`,
      LogPrefix.Steam
    )
  }
  if (result.status !== 'ok') {
    const failed = result.outcomes
      .filter((o) => o.outcome === 'download-failed' || o.outcome === 'refused')
      .map(
        (o) =>
          `${relative(installRoot, o.path)}: ${o.outcome}${o.detail ? ` (${o.detail})` : ''}`
      )
    throw new Error(
      `Could not restore steam_api originals for appId ${steamGame.appId}${failed.length ? `: ${failed.join('; ')}` : ' (restore failed)'}`
    )
  }
  return { stdout: lines.join('\n'), stderr: '' }
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
