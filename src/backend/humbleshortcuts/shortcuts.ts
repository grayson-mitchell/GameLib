import { existsSync } from 'graceful-fs'
import { join } from 'path'
import { isStore, storeCapabilities } from 'common/storeCapabilities'
import type { InstalledInfo, Runner } from 'common/types'
import type { Game } from 'common/types/game_manager'
import {
  RUST_SHORTCUTS_ADD,
  RUST_SHORTCUTS_EXIST,
  RUST_SHORTCUTS_REMOVE,
  RUST_SHORTCUTS_STEAM_ADD,
  RUST_SHORTCUTS_STEAM_IS_ADDED,
  RUST_SHORTCUTS_STEAM_REMOVE
} from 'common/types/sidecarTransport'
import type { StoreManagers } from 'backend/services/types'
import type { GlobalConfigSlice } from 'backend/config'
import { logWarning, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'

/**
 * The scheduled resolvers of the desktop and Steam shortcut services (Phase 94, SVC-05, 86 D-24).
 *
 * A resolver is the one shape a caller of a Rust-owned service keeps in TypeScript while the game's data is
 * still TypeScript's (Phases 89 to 92 port the library managers): it gathers the inputs only TypeScript holds
 * (the game's title, app name, runner, art, install path and store executable, the GOG product-API icon, the
 * shortcut settings, and whether the store can add a Steam shortcut) as `const` declarations, then makes exactly
 * one typed `requestRustInvoke` call and returns it. `humbleShortcutsShimSchedule.test.ts` pins that shape, its
 * channel and the phase that deletes it, so none can grow a second call or a branch.
 *
 * Two families live here, both over `gamelib-shortcuts` and each deleted with the last store whose game data is
 * TypeScript (92):
 * - the renderer's channels, `resolveShortcutsExists`, `resolveAddShortcut`, `resolveRemoveShortcut`,
 *   `resolveAddToSteam`, `resolveRemoveFromSteam` and `resolveIsAddedToSteam`, registered by
 *   `sidecar/shortcutsResolvers.ts`. Add and remove ask Rust to raise the result notification (`notify: true`)
 *   and resolve the op's outcome, whose `existsAfter` the registered handle answers the renderer with;
 * - the store managers' same-signature `addShortcuts`, `removeShortcuts` and `removeNonSteamGame`, which take
 *   the `Game` itself and show nothing (`notify: false`). A partial failure of `addShortcuts` rejects, as the TS
 *   did, because Rust answers an add that wrote less than was asked with an error carrying the TS's message.
 *
 * The path rules, the sanitize port, the icon chain, the writers and the Steam `shortcuts.vdf` edit are Rust's.
 */

/** The slice every resolver of this file reads: the library for a game, the settings, and the one Rust transport. */
export interface ShortcutResolverDeps extends RustInvokeDeps {
  libraryManagers: StoreManagers['library']
  config: Pick<GlobalConfigSlice, 'getSettings'>
}

/** What an op is told about a game: `gamelib-shortcuts` `ShortcutGame`, camelCase. */
interface ShortcutGameInput {
  appName: string
  runner: Runner
  title: string
  isDlc: boolean
  artSquare?: string
  artCover?: string
  artLogo?: string
  installPath?: string
  executable?: string
  canAddSteamShortcut: boolean
  gogExecutable?: string
  gogProductIcon?: string
}

/** The slice of the global settings an op reads: `gamelib-shortcuts` `ShortcutSettings`. */
interface ShortcutSettingsInput {
  addDesktopShortcuts: boolean
  addStartMenuShortcuts: boolean
  addSteamShortcuts: boolean
  defaultSteamPath?: string
}

interface ShortcutInputs {
  game: ShortcutGameInput
  settings: ShortcutSettingsInput
}

/** Which op the inputs are for: what it needs decides whether a GOG icon or store executable is looked up. */
type ShortcutOp = 'add' | 'remove' | 'steamAdd' | 'steamCheck'

const text = (value: string | null | undefined): string | undefined =>
  value ?? undefined

/**
 * The GOG product API's `images.icon`, resolved lazily (the 94-16 and 94-18 caller contract): only when the
 * install holds neither `goggame-<id>.ico` nor `support/icon.png` (the files the crate prefers), and an API
 * failure is no icon, never a failed add. The TS asked the API for no installed game that had either file.
 */
async function gogProductIcon(
  deps: Pick<ShortcutResolverDeps, 'libraryManagers'>,
  appName: string,
  installPath: string | undefined
): Promise<string | undefined> {
  if (
    installPath &&
    (existsSync(join(installPath, `goggame-${appName}.ico`)) ||
      existsSync(join(installPath, 'support', 'icon.png')))
  ) {
    return undefined
  }
  try {
    const response = await deps.libraryManagers.gog.getProductApi(appName)
    return text(response?.data.images?.icon)
  } catch (error) {
    logWarning(
      [`Could not read the GOG product API icon for ${appName}:`, error],
      LogPrefix.Backend
    )
    return undefined
  }
}

/**
 * The GOG library manager's executable for the game, the Windows shortcut's store executable. A game with no
 * metadata (or a URL play task) has none: the TS threw and wrote nothing, here the icon chain simply starts at
 * the install scan.
 */
function gogExecutable(
  deps: Pick<ShortcutResolverDeps, 'libraryManagers'>,
  appName: string
): string | undefined {
  try {
    return deps.libraryManagers.gog.getExecutable(appName)
  } catch (error) {
    logWarning(
      [`Could not read the GOG executable for ${appName}:`, error],
      LogPrefix.Backend
    )
    return undefined
  }
}

/**
 * The inputs of every op, built from the game's info and the settings. The only input helper of this file; it
 * reads the game and the settings first, before any await, so a caller that adds a game to its store after
 * starting the add sees what the TS saw. The slow lookups are lazy: a GOG product icon only for an op that
 * draws an icon, and only when the install ships none; a GOG executable only for the Windows shortcut icon.
 */
async function shortcutInputs(
  deps: ShortcutResolverDeps,
  game: Game,
  op: ShortcutOp
): Promise<ShortcutInputs> {
  const info = game.getGameInfo()
  const config = deps.config.getSettings()
  // The library's `{}` sentinel has no `install` either.
  const install = info.install as Partial<InstalledInfo> | undefined
  // The library's `{}` sentinel has no runner either: a game no store holds cannot be added to Steam.
  const capabilities = storeCapabilities[info.runner] as
    | (typeof storeCapabilities)[Runner]
    | undefined
  const canAddSteamShortcut = capabilities?.canAddSteamShortcut === true
  const settings: ShortcutSettingsInput = {
    addDesktopShortcuts: Boolean(config.addDesktopShortcuts),
    addStartMenuShortcuts: Boolean(config.addStartMenuShortcuts),
    addSteamShortcuts: Boolean(config.addSteamShortcuts),
    defaultSteamPath: text(config.defaultSteamPath)
  }
  const isGog = isStore(info.runner, 'gog')
  const drawsIcon =
    op === 'steamAdd' ||
    (op === 'add' &&
      (process.platform !== 'win32' ||
        (settings.addSteamShortcuts && canAddSteamShortcut)))
  const gameInput: ShortcutGameInput = {
    appName: info.app_name,
    runner: info.runner,
    // A game the library holds no title for (the `{}` sentinel of a double cache miss) has an empty one: the op
    // refuses an add or remove for it and answers false for a check (260905-mv5).
    title: (info.title as string | undefined) ?? '',
    isDlc: install?.is_dlc === true,
    artSquare: text(info.art_square),
    artCover: text(info.art_cover),
    artLogo: text(info.art_logo),
    installPath: text(install?.install_path),
    executable: text(install?.executable),
    canAddSteamShortcut
  }
  if (isGog && op === 'add' && process.platform === 'win32') {
    gameInput.gogExecutable = gogExecutable(deps, info.app_name)
  }
  if (isGog && drawsIcon) {
    gameInput.gogProductIcon = await gogProductIcon(
      deps,
      info.app_name,
      gameInput.installPath
    )
  }
  return { game: gameInput, settings }
}

/**
 * Whether a shortcut for the game exists on disk right now. A game the library holds no title for (the
 * `{}` sentinel of a double cache miss) has no `title`, and Rust answers `false` without a lookup rather
 * than building a path from a made-up name (260905-mv5). Resolves a boolean.
 */
export async function resolveShortcutsExists(
  deps: Pick<ShortcutResolverDeps, 'libraryManagers' | 'requestRustInvoke'>,
  appName: string,
  runner: Runner
): Promise<unknown> {
  const title = deps.libraryManagers[runner].getGame(appName).getGameInfo()
    .title as string | undefined
  return deps.requestRustInvoke(RUST_SHORTCUTS_EXIST, [
    { appName, runner, title }
  ])
}

/**
 * The renderer's `addShortcut`: Rust writes the shortcut files, raises the result notification and resolves
 * `{ written, failed, refused, existsAfter }`. The registered handle answers the renderer with `existsAfter`,
 * the disk re-check it sets its state from.
 */
export async function resolveAddShortcut(
  deps: ShortcutResolverDeps,
  appName: string,
  runner: Runner,
  fromMenu: boolean | undefined
): Promise<unknown> {
  const game = deps.libraryManagers[runner].getGame(appName)
  const inputs = await shortcutInputs(deps, game, 'add')
  return deps.requestRustInvoke(RUST_SHORTCUTS_ADD, [
    {
      game: inputs.game,
      settings: inputs.settings,
      fromMenu,
      notify: true
    }
  ])
}

/**
 * The renderer's `removeShortcut`: Rust removes the shortcut files it can prove it wrote, raises the result
 * notification and resolves `{ removed, refused, existsAfter }`.
 */
export async function resolveRemoveShortcut(
  deps: ShortcutResolverDeps,
  appName: string,
  runner: Runner
): Promise<unknown> {
  const game = deps.libraryManagers[runner].getGame(appName)
  const inputs = await shortcutInputs(deps, game, 'remove')
  return deps.requestRustInvoke(RUST_SHORTCUTS_REMOVE, [
    { game: inputs.game, notify: true }
  ])
}

/** The renderer's `addToSteam`: Rust adds the game to Steam as a non-Steam shortcut and resolves whether it did. */
export async function resolveAddToSteam(
  deps: ShortcutResolverDeps,
  appName: string,
  runner: Runner
): Promise<unknown> {
  const game = deps.libraryManagers[runner].getGame(appName)
  const inputs = await shortcutInputs(deps, game, 'steamAdd')
  return deps.requestRustInvoke(RUST_SHORTCUTS_STEAM_ADD, [
    { game: inputs.game, settings: inputs.settings }
  ])
}

/** The renderer's `removeFromSteam`: Rust removes the game's non-Steam shortcut and its grid art, and resolves null. */
export async function resolveRemoveFromSteam(
  deps: ShortcutResolverDeps,
  appName: string,
  runner: Runner
): Promise<unknown> {
  const game = deps.libraryManagers[runner].getGame(appName)
  const inputs = await shortcutInputs(deps, game, 'steamCheck')
  return deps.requestRustInvoke(RUST_SHORTCUTS_STEAM_REMOVE, [
    { game: inputs.game, settings: inputs.settings }
  ])
}

/** The renderer's `isAddedToSteam`: Rust answers whether the game is already a non-Steam shortcut in Steam. */
export async function resolveIsAddedToSteam(
  deps: ShortcutResolverDeps,
  appName: string,
  runner: Runner
): Promise<unknown> {
  const game = deps.libraryManagers[runner].getGame(appName)
  const inputs = await shortcutInputs(deps, game, 'steamCheck')
  return deps.requestRustInvoke(RUST_SHORTCUTS_STEAM_IS_ADDED, [
    { game: inputs.game, settings: inputs.settings }
  ])
}

/**
 * Adds the game's desktop shortcuts (and, when the settings ask, its Add to Steam entry), for a store manager:
 * after an install or an import, and the game's own `addShortcuts` method. Shows nothing (`notify: false`) and
 * rejects with `Could not write shortcuts: ...` when a requested file could not be written, as the TS did;
 * Rust has by then tried every file. Never reads the renderer.
 */
export async function addShortcuts(
  deps: ShortcutResolverDeps,
  game: Game,
  fromMenu?: boolean
): Promise<unknown> {
  const inputs = await shortcutInputs(deps, game, 'add')
  return deps.requestRustInvoke(RUST_SHORTCUTS_ADD, [
    {
      game: inputs.game,
      settings: inputs.settings,
      fromMenu,
      notify: false
    }
  ])
}

/**
 * Removes the game's desktop shortcuts, for a store manager's uninstall. Shows nothing (`notify: false`) and,
 * as the TS, never rejects for a file it could not delete: an uninstall must not fail over a stale shortcut.
 */
export async function removeShortcuts(
  deps: ShortcutResolverDeps,
  game: Game
): Promise<unknown> {
  const inputs = await shortcutInputs(deps, game, 'remove')
  return deps.requestRustInvoke(RUST_SHORTCUTS_REMOVE, [
    { game: inputs.game, notify: false }
  ])
}

/** Removes the game's non-Steam shortcut and its grid art from Steam, for a store manager's uninstall. */
export async function removeNonSteamGame(
  deps: ShortcutResolverDeps,
  game: Game
): Promise<unknown> {
  const inputs = await shortcutInputs(deps, game, 'steamCheck')
  return deps.requestRustInvoke(RUST_SHORTCUTS_STEAM_REMOVE, [
    { game: inputs.game, settings: inputs.settings }
  ])
}
