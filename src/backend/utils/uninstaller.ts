import type { AppRuntimeSlice } from 'backend/appRuntime'
import { notify } from 'backend/dialog/dialog'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import type { GlobalConfigSlice } from 'backend/config'
import { sendGameStatusUpdate } from 'backend/utils'
import { resolveGameTitle } from 'backend/utils/gameTitle'
import { Runner } from 'common/types'
import { storeMap } from 'common/utils'
import { storeCapabilities } from 'common/storeCapabilities'
import {
  checkRemoval,
  firstBlockingItem,
  guardedRemoveTree,
  type GuardedRemoval
} from 'backend/safety/rustSafety'
import {
  collectKnownInstalls,
  knownInstallKey,
  titleForKnownKey
} from 'backend/safety/knownInstalls'
import { protectedRootsFor } from 'backend/safety/protectedRoots'
import { pushRemovalRefusal } from 'backend/safety/refusal'
import type { SafetyRequest } from 'common/types/safety'
import { existsSync, rmSync } from 'graceful-fs'
import i18next from 'i18next'
import { join } from 'path'

/** R1 slice: the per-runner managers. */
export type UninstallerDeps = Pick<
  ManagerDeps,
  | 'libraryManagers'
  | 'notifications'
  | 'paths'
  | 'sendFrontendMessage'
  | 'requestRustInvoke'
> & {
  config: Pick<GlobalConfigSlice, 'getSettings'>
} & AppRuntimeSlice<'events'>

/**
 * The Rust guard's request for one game's Wine prefix (D-11, D-14): the prefix is a `prefix` target,
 * the known installs are every OTHER game across every store, and the protected roots come from
 * settings and app paths. The drive_c/pfx shape rule and the default/shared prefix refusals live in
 * gamelib-safety (`not-a-prefix`, `is-protected-root`), not here.
 */
function prefixRequest(
  deps: UninstallerDeps,
  appName: string,
  runner: Runner,
  winePrefix: string
): SafetyRequest {
  return {
    targets: [{ id: 'prefix', path: winePrefix, kind: 'prefix' }],
    knownInstalls: collectKnownInstalls(deps, { runner, appName }),
    selfKey: knownInstallKey(runner, appName),
    protectedRoots: protectedRootsFor(deps)
  }
}

/** The game's configured Wine prefix, or `undefined` when none is set or settings cannot be read. */
async function readWinePrefix(
  deps: UninstallerDeps,
  appName: string,
  runner: Runner
): Promise<string | undefined> {
  try {
    const { winePrefix } = await deps.libraryManagers[runner]
      .getGame(appName)
      .getSettings()
    return winePrefix ? winePrefix : undefined
  } catch (error) {
    // No prefix path is known, so there is nothing this call could delete.
    logError(error, LogPrefix.Backend)
    return undefined
  }
}

/**
 * Deletes the game's Wine prefix through the Rust guard (D-11). Resolves `undefined` when the game
 * has no prefix configured, otherwise the guard's result: only `outcome: 'removed'` means the
 * prefix is gone (an already-absent prefix reads as removed).
 */
export const removePrefix = async (
  deps: UninstallerDeps,
  appName: string,
  runner: Runner
): Promise<GuardedRemoval | undefined> => {
  const winePrefix = await readWinePrefix(deps, appName, runner)
  if (!winePrefix) return undefined
  logInfo(`Removing prefix ${winePrefix}`, LogPrefix.Backend)
  return guardedRemoveTree(
    deps,
    prefixRequest(deps, appName, runner, winePrefix)
  )
}

export const removeFixFile = (
  deps: Pick<UninstallerDeps, 'paths'>,
  appName: string,
  runner: Runner
) => {
  // The downloaded tier-1 copy is re-fetched at install from GameLib's repo for
  // every store (quick 261026-avw), so deleting it is safe. Local
  // (`fixes/local/`) and bundled files live elsewhere and are never touched;
  // `.profile.json` is never downloaded and is not deleted.
  const store = storeMap[runner]
  if (!store) return
  const fixFilePath = join(deps.paths.fixesPath, `${appName}-${store}.json`)
  if (existsSync(fixFilePath)) {
    rmSync(fixFilePath)
  }
}

const removeSettingsAndLogs = (
  deps: Pick<UninstallerDeps, 'paths'>,
  appName: string
) => {
  const removeIfExists = (filename: string) => {
    logInfo(`Removing ${filename}`, LogPrefix.Backend)
    const gameSettingsFile = join(deps.paths.gamesConfigPath, filename)
    if (existsSync(gameSettingsFile)) {
      rmSync(gameSettingsFile)
    }
  }

  removeIfExists(appName.concat('.json'))
  removeIfExists(appName.concat('.log'))
  removeIfExists(appName.concat('-lastPlay.log'))
}

/** The other game's display title for a nested/inside refusal, as an optional payload field. */
function otherTitleOf(
  deps: UninstallerDeps,
  otherKey: string | undefined
): { otherTitle?: string } {
  const otherTitle = otherKey ? titleForKnownKey(deps, otherKey) : undefined
  return otherTitle ? { otherTitle } : {}
}

export const uninstallGameCallback = async (
  deps: UninstallerDeps,
  event: unknown,
  appName: string,
  runner: Runner,
  shouldRemovePrefix: boolean,
  shouldRemoveSetting: boolean
) => {
  sendGameStatusUpdate(deps, {
    appName,
    runner,
    status: 'uninstalling'
  })

  const game = deps.libraryManagers[runner].getGame(appName)
  // Quick task 260905-mv5 (site 2, D-03): getGameInfo() can return
  // `{} as GameInfo` on a double cache miss (D-01) -- resolveGameTitle
  // falls back to appName so neither the uninstall-error nor the
  // uninstall-success notification below is ever nameless.
  const title = resolveGameTitle(deps.libraryManagers, runner, appName)

  const removesPrefix =
    shouldRemovePrefix && !storeCapabilities[runner].installHandOffToClient

  // D-14: check the prefix BEFORE the install is uninstalled. A refusal here leaves the game, its
  // settings and the prefix exactly as they were, so clicking Uninstall again re-runs the same
  // checks (nothing was mutated to change the verdict).
  if (removesPrefix) {
    const winePrefix = await readWinePrefix(deps, appName, runner)
    if (winePrefix) {
      const check = await checkRemoval(
        deps,
        prefixRequest(deps, appName, runner, winePrefix)
      )
      if (check.overall !== 'yes') {
        const blocking = firstBlockingItem(check)
        pushRemovalRefusal(deps, {
          kind: 'uninstall',
          outcome: 'refused',
          reason: blocking?.reason ?? 'bad-reply',
          title,
          appName,
          runner,
          ...otherTitleOf(deps, blocking?.otherKey)
        })
        sendGameStatusUpdate(deps, { appName, runner, status: 'done' })
        return
      }
    }
  }

  let uninstalled = false

  try {
    const result = await game.uninstall({ shouldRemovePrefix })
    if (result?.refused) {
      // quick 261107-td5: the uninstall declined and changed nothing. The
      // refusing route owns the user-facing message; keep settings/logs/
      // prefix/fix file and clear the "uninstalling" status.
      // quick 261110-uog: stderr is logged by the refusing/failing route itself; only its length here (logSecretGate).
      logInfo(
        `Uninstall refused; keeping settings for ${runner} ${appName} (stderrLength=${result.stderr.length})`,
        LogPrefix.Backend
      )
      sendGameStatusUpdate(deps, { appName, runner, status: 'done' })
      return
    }
    if (result?.failed) {
      // quick 261108-anw: the delete errored, possibly partially. Keep
      // GameLib state so a retry is possible; the failing route sends no
      // done, so this is the single done. The route owns the in-app notice.
      // quick 261110-uog: stderr is logged by the refusing/failing route itself; only its length here (logSecretGate).
      logInfo(
        `Uninstall failed; keeping settings for ${runner} ${appName} (stderrLength=${result.stderr.length})`,
        LogPrefix.Backend
      )
      sendGameStatusUpdate(deps, { appName, runner, status: 'done' })
      return
    }
    uninstalled = true
  } catch (error) {
    notify(deps, {
      title,
      body: i18next.t('notify.uninstallError', 'Error uninstalling')
    })
    logError(error, LogPrefix.Backend)
  }

  if (uninstalled) {
    // quick 261112-90h: Steam bridge/bottle routes remove their own per-game
    // bottles, and a bottle-eligible title's winePrefix is the shared CrossOver
    // Steam bottle, which must never be deleted from an uninstall.
    if (removesPrefix) {
      // The game itself is already uninstalled, so a refused or failed prefix delete does not undo
      // that: the success notification and the done status below still fire.
      const removed = await removePrefix(deps, appName, runner)
      if (removed && removed.outcome !== 'removed') {
        pushRemovalRefusal(deps, {
          kind: 'remove-prefix',
          outcome: removed.outcome,
          reason: removed.reason ?? 'bad-reply',
          title,
          appName,
          runner,
          ...otherTitleOf(deps, removed.otherKey)
        })
      }
    }
    if (shouldRemoveSetting) {
      removeSettingsAndLogs(deps, appName)
    }
    removeFixFile(deps, appName, runner)

    // GAME-03: Steam uninstall is confirmed by the ACF poller (pollUninstallOnce),
    // which fires the "Game Uninstalled" toast when the manifest disappears.
    // Suppress the success notify here for steam to avoid a duplicate/premature toast.
    if (!storeCapabilities[runner].installManagedExternally) {
      notify(deps, { title, body: i18next.t('notify.uninstalled') })
    }
    logInfo('Finished uninstalling', LogPrefix.Backend)
  }

  // Steam: ACF poller emits the real done signal — suppress it here to prevent
  // the badge flash caused by uninstallGameCallback resolving instantly (GAME-03).
  if (!storeCapabilities[runner].installManagedExternally) {
    sendGameStatusUpdate(deps, {
      appName,
      runner,
      status: 'done'
    })
  }
}
