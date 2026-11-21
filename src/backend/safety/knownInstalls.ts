/**
 * Phase 82 (FND-02, D-16): the cross-store list of installed games a destructive op must not
 * overlap. One `{ key, path }` per installed library entry across every store manager, so a game
 * folder that contains (or sits inside) ANOTHER store's install is refused by the Rust guard, not
 * only a same-store sibling.
 *
 * Per-store source of the path (pinned in knownInstalls.test.ts): legendary, gog, nile and steam
 * carry `install.install_path`; a sideloaded game carries only `install.executable`, so its folder
 * is `dirname(executable)` (the same folder `SideloadGame.uninstall` removes).
 *
 * IN-04: Steam's native installer writes into `steamapps/common/<installdir>` long before the
 * entry is `is_installed`, so an in-progress (or cancelled, or crashed) native install also counts:
 * the resume breadcrumb (`steamResumeTargetSteamappsDir` + `steamResumeInstalldir`, written at
 * install start) names the folder, and failing that a `steamResumePending` entry's `install_path`.
 * legendary, gog and nile entries take their install info from the store's installed list, which
 * the store tool writes when the install completes, so their in-progress installs are outside D-16
 * (no folder is recorded on the library entry while the install runs).
 *
 * Never-loaded versus empty: `LibraryManager` exposes no "loaded" signal, so a library that has
 * not loaded yet cannot be told apart from an empty one, and an empty list is also the permanent
 * state of a store the user never signed in to. Returning `null` for an empty list would make
 * every removal `unknown` for most users, so an empty list stays an empty list.
 *
 * Exit contract: no timers, no handles, no work at import, no module-level mutable state.
 */
import { dirname, join } from 'path'
import type { GameInfo, Runner } from 'common/types'
import type { ManagerDeps } from 'backend/services/types'
import { isStore } from 'common/storeCapabilities'
import { resolveGameTitle } from 'backend/utils/gameTitle'
import type { SafetyKnownInstall } from 'common/types/safety'
import type { SteamInstalledInfo } from 'common/types/steam'

type LibraryDeps = Pick<ManagerDeps, 'libraryManagers'>

/** The stable identity of a library entry across stores: `<runner>:<appName>`. */
export function knownInstallKey(runner: Runner, appName: string): string {
  return `${runner}:${appName}`
}

function installFolder(runner: Runner, game: GameInfo): string | undefined {
  const installPath = game.install.install_path
  if (installPath) return installPath
  const executable = game.install.executable
  if (isStore(runner, 'sideload') && executable) {
    return dirname(executable)
  }
  return undefined
}

/**
 * IN-04: the folder a Steam native install that is not yet `is_installed` already occupies, or
 * undefined. A stale `install_path` on an entry with no in-progress marker is not enough.
 */
function steamInProgressFolder(
  runner: Runner,
  game: GameInfo
): string | undefined {
  if (!isStore(runner, 'steam')) return undefined
  const install: Partial<SteamInstalledInfo> = game.install
  const {
    steamResumeTargetSteamappsDir: target,
    steamResumeInstalldir: installdir,
    steamResumePending,
    install_path: installPath
  } = install
  if (
    typeof target === 'string' &&
    target &&
    typeof installdir === 'string' &&
    installdir
  ) {
    return join(target, 'common', installdir)
  }
  if (steamResumePending === true && installPath) return installPath
  return undefined
}

/**
 * Every installed library entry except the caller's own, plus Steam's in-progress native installs. Returns `null` when any manager's
 * `getListOfGames` throws: a list that could not be read is `unknown` to the guard, never "no
 * other installs".
 */
export function collectKnownInstalls(
  deps: LibraryDeps,
  self?: { runner: Runner; appName: string }
): SafetyKnownInstall[] | null {
  const selfKey = self ? knownInstallKey(self.runner, self.appName) : undefined
  const out: SafetyKnownInstall[] = []
  for (const runner of Object.keys(deps.libraryManagers) as Runner[]) {
    let games: GameInfo[]
    try {
      games = deps.libraryManagers[runner].getListOfGames()
    } catch {
      return null
    }
    for (const game of games) {
      const path = game.is_installed
        ? installFolder(runner, game)
        : steamInProgressFolder(runner, game)
      if (!path) continue
      const key = knownInstallKey(runner, game.app_name)
      if (key === selfKey) continue
      out.push({ key, path })
    }
  }
  return out
}

/** Maps a known-install key back to the other game's title, for the refusal notice. */
export function titleForKnownKey(
  deps: LibraryDeps,
  key: string
): string | undefined {
  const at = key.indexOf(':')
  if (at <= 0) return undefined
  const runner = key.slice(0, at)
  const appName = key.slice(at + 1)
  if (!appName || !Object.hasOwn(deps.libraryManagers, runner)) return undefined
  return resolveGameTitle(deps.libraryManagers, runner as Runner, appName)
}
