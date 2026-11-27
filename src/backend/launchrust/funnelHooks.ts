import type { LaunchOption, WineInstallation } from 'common/types'
import type { FunnelHookCall } from 'common/types/ipc/sidecarInternal'
import type { GlobalConfigSlice } from 'backend/config'
import type { GameConfigs } from 'backend/game_config'
import {
  flushLogForwarder,
  gameLogWriterFromHandOff,
  logError,
  LogPrefix
} from 'backend/logger'
import type { StoreManagers, Stores } from 'backend/services/types'

/**
 * The TS side of the Rust launch funnel's ManagerHooks ops (Phase 88.3, 88.3-08, D-26, D-29): `answerFunnelHook` answers
 * the eight ops the shell's `SidecarManagerHooks` sends over `launchManagerCall` (88.3-06), each exactly as the TS funnel
 * (`runLaunchEventCallback`) made the same call. `registerLaunchManagerHooks` validates the frame at the sidecar boundary
 * and hands every op but 88.2's `game_title` and `force_uninstall` here, where the frame is validated once more.
 *
 * Interim glue: it is deleted with the managers' move out of TypeScript (91 and 92).
 *
 * What may cross back into Rust is a fixed shape: the facts, `{ launched, rotated }`, or a boolean. A manager error is never
 * answered as text. The TS-only error lines (an exception from `launch()`, a saves sync that threw) are written here, where
 * the error object lives, before the answer. The handler creates no timer, watcher or handle (the sidecar's exit contract).
 */

/** What the funnel hooks read and write: the managers, the stores' launch hooks and the settings. */
export interface FunnelHookDeps {
  libraryManagers: StoreManagers['library']
  launchHooks: StoreManagers['launchHooks']
  config: Pick<GlobalConfigSlice, 'getSettings' | 'setSetting'>
  gameConfigs: Pick<GameConfigs, 'get'>
  stores: Pick<Stores, 'kvs'>
  /** Whether this process was started without a window (`--no-gui`). */
  isCLINoGui: boolean
}

/**
 * Why a hook call was refused. It names the op the call carried only (cut to 32 characters, anything outside
 * `[A-Za-z0-9_-]` shown as `?`): the runner, the app name and the payload are never in it, because a forged call's text can
 * carry a path or a token (T-88.3-19).
 */
export function hookRefusal(op: unknown): string {
  if (typeof op !== 'string') return 'launchManagerCall: unknown op'
  const named = op.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '?')
  return `launchManagerCall: bad arguments for ${named}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Narrows a wine the shell sent to a wine installation (`bin`, `name` and `type` strings), or answers `undefined`. The
 * object is Rust's own validated pick, so the narrowing is a guard against a forged frame, not a conversion (T-88.1-40).
 */
function narrowWine(value: unknown): WineInstallation | undefined {
  if (
    isRecord(value) &&
    typeof value.bin === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string'
  ) {
    return value as unknown as WineInstallation
  }
  return undefined
}

/**
 * Answers one funnel hook call. Resolves the op's fixed answer; a manager that throws rejects the call (which the shell maps
 * to its own fixed hook failure), except where the TS funnel handled the throw itself (`launch`, `sync_saves`), whose line
 * is written here first.
 */
export async function answerFunnelHook(
  deps: FunnelHookDeps,
  call: FunnelHookCall
): Promise<unknown> {
  switch (call[0]) {
    case 'launch_facts': {
      const { runner, appName } = call[1]
      const game = deps.libraryManagers[runner].getGame(appName)
      const gameInfo = game.getGameInfo()
      const settings = await game.getSettings()
      const isNative = game.isNative()
      // The per-game config is a different store from `settings`, read separately as the TS did.
      const verboseLogs = (await deps.gameConfigs.get(appName).getSettings())
        .verboseLogs
      const global = deps.config.getSettings()
      return {
        gameInfo,
        settings,
        isNative,
        verboseLogs: Boolean(verboseLogs),
        global: {
          minimizeOnLaunch: Boolean(global.minimizeOnLaunch),
          noTrayIcon: Boolean(global.noTrayIcon),
          disableLogs: Boolean(global.disableLogs),
          disablePlaytimeSync: Boolean(global.disablePlaytimeSync)
        },
        cliNoGui: deps.isCLINoGui
      }
    }

    case 'launch': {
      const { runner, appName, launchArguments, args, skipVersionCheck, log } =
        call[1]
      const game = deps.libraryManagers[runner].getGame(appName)
      // The facade owes the rotation exactly when the funnel's hand-off said so: one rotation between the two.
      const writer = gameLogWriterFromHandOff(log)
      let launched: boolean
      try {
        launched = await game.launch(
          writer,
          launchArguments as LaunchOption | undefined,
          args,
          skipVersionCheck
        )
      } catch (exception) {
        logError(exception, LogPrefix.Backend)
        await writer.logError([
          `An exception occurred when launching the game:`
        ])
        await writer.logError(exception)
        launched = false
      }
      // The manager's lines must be on the wire before Rust writes the lines that follow them.
      await flushLogForwarder()
      return { launched, rotated: writer.rotationClaimed }
    }

    case 'sync_saves': {
      const { runner, appName, direction, savesPath, gogSaves } = call[1]
      const game = deps.libraryManagers[runner].getGame(appName)
      try {
        // The TS passed the stored `savesPath` as it was, undefined for a game with none.
        await game.syncSaves(
          direction,
          (savesPath ?? undefined) as string,
          gogSaves
        )
        return true
      } catch (error) {
        const { title } = game.getGameInfo()
        logError(
          direction === '--skip-upload'
            ? `Error while downloading saves for ${title}. ${String(error)}`
            : `Error uploading saves for ${title}. Error: ${String(error)}`,
          LogPrefix.Backend
        )
        return false
      }
    }

    case 'set_presence': {
      const { runner, appName } = call[1]
      const hook = deps.launchHooks[runner].setPresence
      if (!hook) return false
      await hook(appName)
      return true
    }

    case 'clear_presence': {
      const hook = deps.launchHooks[call[1].runner].clearPresence
      if (!hook) return false
      await hook()
      return true
    }

    case 'persist_bottle_wine_version': {
      const { runner, wine } = call[1]
      const hook = deps.launchHooks[runner].persistBottleWineVersion
      if (!hook) return false
      const installation = narrowWine(wine)
      if (!installation) throw new Error(hookRefusal(call[0]))
      await hook(installation)
      return true
    }

    case 'update_gog_playtime': {
      const { appName, start, end } = call[1]
      // A rejection rejects the call, as the TS let it reject the launch.
      await deps.libraryManagers.gog
        .getGame(appName)
        .updateGOGPlaytime(new Date(start), new Date(end))
      return true
    }

    case 'wine_settings_write': {
      const { appName, global, game } = call[1]
      // Both values are narrowed before either is written, so a refusal writes nothing.
      const globalWine = global === undefined ? undefined : narrowWine(global)
      const gameWine = game === undefined ? undefined : narrowWine(game)
      if (
        (global !== undefined && !globalWine) ||
        (game !== undefined && !gameWine)
      ) {
        throw new Error(hookRefusal(call[0]))
      }
      // The global one came first in the TS: the default wine was set when it was downloaded. Only `wineVersion` is written.
      if (globalWine) {
        deps.config.setSetting('wineVersion', globalWine, deps.stores.kvs)
      }
      if (gameWine) {
        deps.gameConfigs.get(appName).setSetting('wineVersion', gameWine)
      }
      return true
    }
  }
}
