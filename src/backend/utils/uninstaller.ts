import type { AppRuntimeSlice } from 'backend/appRuntime'
import { notify } from 'backend/dialog/dialog'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import type { GlobalConfigSlice } from 'backend/config'
import type { GameConfigs } from 'backend/game_config'
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
import {
  REMOVAL_REASONS,
  type RemovalReason,
  type SafetyOutcome,
  type SafetyRequest
} from 'common/types/safety'
import { removeGameBottle } from 'backend/enginewine/bottles'
import type { GameSettings } from 'common/types'
import { z } from 'zod'
import { dropSettingsDoc, settingsDocExists } from 'backend/stores/settingsDocs'
import { existsSync } from 'graceful-fs'
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
  | 'storeRoot'
> & {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  /**
   * The per-game config registry. When present, a removed settings document's cached instance is
   * forgotten too (C-WR-02); a caller without one leaves the instance as it was.
   */
  gameConfigs?: Pick<GameConfigs, 'forget'>
} & AppRuntimeSlice<'events'>

/**
 * The guard's inputs for one game, the same values on both routes (the stored prefix and the per-game bottle): the
 * known installs are every OTHER game across every store, and the protected roots come from settings and app paths.
 */
function guardInputs(deps: UninstallerDeps, appName: string, runner: Runner) {
  return {
    knownInstalls: collectKnownInstalls(deps, { runner, appName }),
    selfKey: knownInstallKey(runner, appName),
    protectedRoots: protectedRootsFor(deps)
  }
}

/**
 * The Rust guard's request for one game's Wine prefix (D-11, D-14): the prefix is a `prefix` target.
 * The drive_c/pfx shape rule and the default/shared prefix refusals live in gamelib-safety
 * (`not-a-prefix`, `is-protected-root`), not here.
 */
function prefixRequest(
  deps: UninstallerDeps,
  appName: string,
  runner: Runner,
  winePrefix: string
): SafetyRequest {
  return {
    targets: [{ id: 'prefix', path: winePrefix, kind: 'prefix' }],
    ...guardInputs(deps, appName, runner)
  }
}

/** The game's stored settings, or `undefined` when they cannot be read. */
async function readStoredSettings(
  deps: UninstallerDeps,
  appName: string,
  runner: Runner
): Promise<GameSettings | undefined> {
  try {
    return await deps.libraryManagers[runner].getGame(appName).getSettings()
  } catch (error) {
    // No prefix path is known, so there is nothing this call could delete.
    logError(error, LogPrefix.Backend)
    return undefined
  }
}

/** The game's configured Wine prefix, or `undefined` when none is set or settings cannot be read. */
async function readWinePrefix(
  deps: UninstallerDeps,
  appName: string,
  runner: Runner
): Promise<string | undefined> {
  const settings = await readStoredSettings(deps, appName, runner)
  return settings?.winePrefix ? settings.winePrefix : undefined
}

/** What `engine_bottle_remove_per_game` answers (87-66): the four outcomes, the reason a closed word. */
const bottleReplySchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('removed') }),
  z.object({ outcome: z.literal('not-bottle-backed') }),
  z.object({
    outcome: z.literal('refused'),
    reason: z.string(),
    otherKey: z.string().optional()
  }),
  z.object({ outcome: z.literal('failed'), reason: z.string() })
])

/** How a prefix or bottle removal ended, and which removal notice kind names it. */
interface PrefixRemoval {
  kind: 'remove-prefix' | 'remove-bottle'
  outcome: SafetyOutcome
  reason?: RemovalReason
  otherKey?: string
}

/**
 * A reason the notice can carry. The crate's bottle op also answers `in-use` and `unsafe-name`, which are not in
 * the notice's closed vocabulary; they read as `bad-reply` (the same word an unreadable verdict gets).
 */
function noticeReason(word: string): RemovalReason {
  return (REMOVAL_REASONS as readonly string[]).includes(word)
    ? (word as RemovalReason)
    : 'bad-reply'
}

/**
 * Asks Rust to remove the game's own per-game bottle (87-70, F5). Resolves `'not-bottle-backed'` when the game has
 * no bottle of its own (nothing was touched; the caller keeps its stored-prefix path), otherwise how the removal
 * ended. A call that rejects or answers nonsense is `failed`: the bottle's state is unconfirmed, and the uninstall
 * that already happened is not undone.
 */
async function removeOwnBottle(
  deps: UninstallerDeps,
  appName: string,
  runner: Runner,
  stored: GameSettings
): Promise<PrefixRemoval | 'not-bottle-backed'> {
  const failed = (reason: RemovalReason): PrefixRemoval => ({
    kind: 'remove-bottle',
    outcome: 'failed',
    reason
  })
  let raw: unknown
  try {
    raw = await removeGameBottle(deps, {
      runner,
      appName,
      stored,
      ...guardInputs(deps, appName, runner)
    })
  } catch {
    // Fixed text only: the rejection can carry a path.
    logWarning(
      'removePrefix: the per-game bottle removal did not answer',
      LogPrefix.Backend
    )
    return failed('rust-invoke-failed')
  }
  const parsed = bottleReplySchema.safeParse(raw)
  if (!parsed.success) {
    logWarning(
      'removePrefix: the per-game bottle removal gave an unreadable answer',
      LogPrefix.Backend
    )
    return failed('bad-reply')
  }
  const reply = parsed.data
  switch (reply.outcome) {
    case 'not-bottle-backed':
      return 'not-bottle-backed'
    case 'removed':
      logInfo('Removed the game bottle', LogPrefix.Backend)
      return { kind: 'remove-bottle', outcome: 'removed' }
    case 'refused':
      return {
        kind: 'remove-bottle',
        outcome: 'refused',
        reason: noticeReason(reply.reason),
        ...(reply.otherKey !== undefined ? { otherKey: reply.otherKey } : {})
      }
    case 'failed':
      return failed(noticeReason(reply.reason))
  }
}

/**
 * Removes what the game's uninstall leaves of its Wine setup. Resolves `undefined` when there is nothing to remove.
 *
 * A game with a per-game bottle of its own (the crate decides, 87-66) has that bottle removed through Rust; every
 * other game goes on to the stored-prefix removal through the Rust guard (D-11). In that case the shared default
 * prefix is never deleted: a game that has no prefix of its own points at it, and it holds every such game's data
 * (the uninstall dialog's rule, enforced here too). Only `outcome: 'removed'` means the thing is gone (an
 * already-absent prefix reads as removed).
 */
const removePrefix = async (
  deps: UninstallerDeps,
  appName: string,
  runner: Runner
): Promise<PrefixRemoval | undefined> => {
  const stored = await readStoredSettings(deps, appName, runner)
  if (!stored) return undefined
  const bottle = await removeOwnBottle(deps, appName, runner, stored)
  if (bottle !== 'not-bottle-backed') return bottle
  const winePrefix = stored.winePrefix ? stored.winePrefix : undefined
  if (!winePrefix) return undefined
  if (winePrefix === deps.config.getSettings().winePrefix) {
    logInfo(
      'Keeping the shared default Wine prefix: the game has no prefix of its own',
      LogPrefix.Backend
    )
    return undefined
  }
  logInfo(`Removing prefix ${winePrefix}`, LogPrefix.Backend)
  const removed = await guardedRemoveTree(
    deps,
    prefixRequest(deps, appName, runner, winePrefix)
  )
  return {
    kind: 'remove-prefix',
    outcome: removed.outcome,
    ...(removed.reason !== undefined ? { reason: removed.reason } : {}),
    ...(removed.otherKey !== undefined ? { otherKey: removed.otherKey } : {})
  }
}

/** What the app-data file deletes need: the guard's transport, the known installs and the roots. */
type AppDataRemovalDeps = Pick<
  UninstallerDeps,
  | 'paths'
  | 'requestRustInvoke'
  | 'libraryManagers'
  | 'config'
  | 'storeRoot'
  | 'gameConfigs'
>

/**
 * Deletes GameLib's own per-game data files through the Rust guard. The paths are built from
 * `appName`, which is renderer text, and `join` is not containment (`'../config'` reaches
 * `appFolder/config.json`), so each file is an `app-data` target and the guard's `trustRoot` is the
 * containment check: an escaping path is refused `outside-trust-root` and nothing is deleted
 * (quick 261120-ux8, todo 2026-11-20-uninstall-file-deletes-trust-renderer-appname).
 *
 * Only existing candidates are sent. That is not a safety check (everything sent is still guarded
 * and the crate re-checks on delete); it spares a Rust round trip in the common no-file case.
 * Resolves `undefined` when there is nothing to delete. A refusal or failure is one closed-set
 * warning line, never the appName or a path; the game is already uninstalled, so there is no toast.
 */
async function removeAppDataFiles(
  deps: AppDataRemovalDeps,
  op: 'remove-fix-file' | 'remove-settings',
  trustRoot: string,
  candidates: { id: string; path: string }[]
): Promise<GuardedRemoval | undefined> {
  // A settings document written but not yet applied by the shell counts as present (85-15): sent,
  // the shell finds nothing to delete, reports `removed`, and refuses the queued write.
  const present = (path: string) =>
    deps.storeRoot ? settingsDocExists(deps.storeRoot, path) : existsSync(path)
  const existing = candidates.filter(({ path }) => present(path))
  if (existing.length === 0) return undefined
  const removed = await guardedRemoveTree(deps, {
    targets: existing.map(({ id, path }) => ({
      id,
      path,
      kind: 'app-data' as const,
      trustRoot
    })),
    knownInstalls: collectKnownInstalls(deps),
    protectedRoots: protectedRootsFor(deps)
  })
  if (removed.outcome !== 'removed') {
    logWarning(
      `[safety] ${op} ${removed.outcome}: ${removed.reason ?? 'bad-reply'}`,
      LogPrefix.Backend
    )
  }
  return removed
}

export const removeFixFile = async (
  deps: AppDataRemovalDeps,
  appName: string,
  runner: Runner
): Promise<GuardedRemoval | undefined> => {
  // The downloaded tier-1 copy is re-fetched at install from GameLib's repo for
  // every store (quick 261026-avw), so deleting it is safe. Local
  // (`fixes/local/`) and bundled files live elsewhere and are never touched;
  // `.profile.json` is never downloaded and is not deleted.
  const store = storeMap[runner]
  if (!store) return undefined
  return removeAppDataFiles(deps, 'remove-fix-file', deps.paths.fixesPath, [
    {
      id: 'fix-file',
      path: join(deps.paths.fixesPath, `${appName}-${store}.json`)
    }
  ])
}

/**
 * Deletes the game's settings document and logs. When the removal reports `removed`, the settings
 * document's mirror cell is dropped too (85-15, T-85-38): the shell has already evicted the store
 * and refused any write queued for it, and without the drop this process would keep serving the
 * deleted settings and a later read would not go to disk.
 */
const removeSettingsAndLogs = async (
  deps: AppDataRemovalDeps,
  appName: string
) => {
  const { gamesConfigPath } = deps.paths
  const files: [string, string][] = [
    ['settings', appName.concat('.json')],
    ['log', appName.concat('.log')],
    ['last-play-log', appName.concat('-lastPlay.log')]
  ]
  for (const [, filename] of files) {
    logInfo(`Removing ${filename}`, LogPrefix.Backend)
  }
  const settingsPath = join(gamesConfigPath, appName.concat('.json'))
  const removed = await removeAppDataFiles(
    deps,
    'remove-settings',
    gamesConfigPath,
    files.map(([id, filename]) => ({
      id,
      path: join(gamesConfigPath, filename)
    }))
  )
  if (removed?.outcome === 'removed') {
    if (deps.storeRoot) dropSettingsDoc(deps.storeRoot, settingsPath)
    // The cached GameConfig instance serves `.config` straight from memory and would write the
    // deleted overrides back on its next save (C-WR-02).
    deps.gameConfigs?.forget(appName)
  }
  return removed
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
          kind: removed.kind,
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
      await removeSettingsAndLogs(deps, appName)
    }
    await removeFixFile(deps, appName, runner)

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
