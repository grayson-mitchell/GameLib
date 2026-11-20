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
 * Exit contract: no timers, no handles, no work at import, no module-level mutable state.
 */
import { dirname } from 'path'
import type { GameInfo, Runner } from 'common/types'
import type { ManagerDeps } from 'backend/services/types'
import { isStore } from 'common/storeCapabilities'
import { resolveGameTitle } from 'backend/utils/gameTitle'
import type { SafetyKnownInstall } from 'common/types/safety'

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
 * Every installed library entry except the caller's own. Returns `null` when any manager's
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
      if (!game.is_installed) continue
      const path = installFolder(runner, game)
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
