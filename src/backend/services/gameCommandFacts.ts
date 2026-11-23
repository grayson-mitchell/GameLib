/**
 * The facts a wine command on a game needs from TypeScript (Phase 87, 87-36, D-23).
 *
 * `wine_run_command_for_game` and `wine_tool_call` run the command and judge every guard in Rust (the Steam
 * per-game-bottle guard, the native guard, the install-path guard, the sideload-only pending install and the
 * command-shape guard), but they cannot read the library, the game configs or the Steam bottle markers. This module
 * is the one place TypeScript reads them, for the `runWineCommandForGame` and `callTool` resolvers of
 * `sidecar/engineWineResolvers.ts` and for the launcher's known-fix `runInPrefix` step (through the same resolver).
 * Phase 98 deletes it with the config and the library those read.
 *
 * It decides nothing Rust does not also decide. The one thing it keeps from the TS `runWineCommandOnGame` is the
 * ORDER: resolving the tool settings creates the game's bottle (`ensureBottle`), so a command a guard will refuse
 * must not resolve them. Where it can see a guard would refuse it answers `unavailable` without resolving, and
 * Rust refuses on its own guard first, with the TS's log line. The guards stay Rust's (D-08).
 *
 * Windows has no wine: for a command the renderer sends, the crate spawns the program itself, so nothing here reads a
 * game. A Wine tool button (`callTool`) never had that branch and still reads the game, which is native there.
 */
import type { Runner } from 'common/types'
import { isStore, storeCapabilities } from 'common/storeCapabilities'
import { isWindows } from 'backend/constants/environment'
import { resolveEngineToolSettings } from 'backend/enginewine/toolSettings'
import type { AppPaths } from 'backend/process/context'
import {
  resolveToolTarget,
  toolSettingsResultFrom,
  type WinetricksTarget
} from './winetricksTarget'
import type { EngineServicesSource } from './engineServices'

/**
 * What Rust's `ForGameArgs` takes beyond the command: the game, exactly one of the tool settings or the reason there
 * are none, the Steam eligibility, the native flag and the game info's folder name and install path.
 */
export type GameCommandFacts = WinetricksTarget & {
  /** `isSteamWineToolsEligible`, or true for a store whose games always have a Wine prefix. */
  steamEligible: boolean
  /** `game.isNative()`. */
  isNative: boolean
  /** `getGameInfo().folder_name`. */
  folderName?: string
  /** `getGameInfo().install.install_path`; absent when the game info carries no install. */
  installPath?: string
}

/** The source this module reads: the engine services' source, with the path roots the Steam bottle markers need. */
export type GameCommandSource = EngineServicesSource & {
  paths: Pick<AppPaths, 'userHome'>
}

/** `isSteamWineToolsEligible`, imported when needed (the Steam bridge module imports the engine). */
async function steamWineToolsEligible(
  source: GameCommandSource,
  appName: string
): Promise<boolean> {
  const { isSteamWineToolsEligible } =
    await import('backend/storeManagers/steam/bridgeWineTools')
  return isSteamWineToolsEligible(source.paths, appName)
}

/** The facts of a game that is not in the library at all (a Windows spawn, a refused pending install). */
function unresolved(
  runner: Runner,
  appName: string,
  reason: string,
  steamEligible = true
): GameCommandFacts {
  return {
    runner,
    appName,
    unavailable: reason,
    steamEligible,
    isNative: false
  }
}

/**
 * Gathers the facts for a wine command on `runner`/`appName`. `pendingInstall` is the sideload "Run installer" that
 * runs before the game is in the library (CR-04): it has no library entry, so its tool settings come from the game
 * config the dialog just wrote. `tool` is a Wine tool button (`callTool`: winecfg, Run EXE). Rejects when the library, the game config or a resolver fails (the TS handler's
 * errors reached the renderer too).
 */
export async function gatherGameCommandFacts(
  source: GameCommandSource,
  runner: Runner,
  appName: string,
  { pendingInstall, tool = false }: { pendingInstall: boolean; tool?: boolean }
): Promise<GameCommandFacts> {
  // Windows has no wine: the crate spawns a renderer command's program itself. A Wine tool button (`tool`) has
  // no such branch: it reads the game as on every platform, and a Windows game is native, so Rust refuses it.
  if (isWindows && !tool) return unresolved(runner, appName, 'windows')

  if (pendingInstall) {
    // Rust refuses a pending install of any other runner (sideload only) before it reads the settings.
    if (!isStore(runner, 'sideload')) {
      return unresolved(runner, appName, 'not-sideload')
    }
    const stored = await source.gameConfigs.get(appName).getSettings()
    // Rust decides, creating the bottle the installer is about to run in (87-56a, D-23).
    const resolved = toolSettingsResultFrom(
      await resolveEngineToolSettings(
        { requestRustInvoke: source.requestRustInvoke },
        {
          runner: 'sideload',
          appName,
          platform: 'Windows',
          stored,
          ensureBottle: true
        }
      )
    )
    return resolved.kind === 'unavailable'
      ? unresolved(runner, appName, resolved.reason)
      : {
          runner,
          appName,
          settings: resolved.settings,
          steamEligible: true,
          isNative: false
        }
  }

  // Pitfall 5: a Steam title shares bottles in two layouts, so only one with its own ready per-game bottle may
  // have a Wine action. A store whose games always have a Wine prefix is eligible by construction.
  const steamEligible =
    storeCapabilities[runner].winePrefixToolsAvailable ||
    (await steamWineToolsEligible(source, appName))
  if (!steamEligible) return unresolved(runner, appName, 'steam', false)

  const game = source.libraryManagers[runner].getGame(appName)
  const isNative = game.isNative()
  const info = game.getGameInfo()
  const folderName = info.folder_name
  const installPath = info.install?.install_path
  const known = { steamEligible, isNative, folderName, installPath }
  // A command Rust will refuse (a native game, no resolved install path) never creates the game's bottle.
  if (isNative || !installPath) {
    return { runner, appName, unavailable: 'refused', ...known }
  }
  const target = await resolveToolTarget(source, runner, appName, {
    ensureBottle: true
  })
  return { ...target, ...known }
}
