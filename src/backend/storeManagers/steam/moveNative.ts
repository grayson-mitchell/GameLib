/**
 * Move install for a Steam-registered game (quick 261122-9sl): ask the running Mac Steam to
 * CanMoveApp then MoveApp(appId, folderIndex) through the bridge helper (spike 090). Steam moves
 * the files, the ACF and the workshop content itself, with no Steam window; GameLib copies
 * nothing. The helper holds until Steam's own move and the verify Steam runs after it have
 * settled, so `moveInstall()`'s pending promise is the "Moving..." readout the IPC handler shows.
 *
 * Why install_path is reconciled: Steam rewrites the ACF in the new library, but GameLib's cached
 * `install_path` is never re-derived at startup, so the game showed "not available" until a full
 * Refresh (spike 090 step 7). After a finished move this calls `refreshInstallState`, which
 * rewrites a changed install_path from the ACF scan, then checks the new path really is inside
 * the target library before reporting done.
 *
 * The destination is not trusted: it must canonicalise to one of Steam's registered library
 * folders (the library root, its steamapps, or steamapps/common), and the helper re-checks it
 * against Steam's own live folder list. GameLib never writes or deletes game files on this route.
 *
 * Exit contract: this module creates no timers or handles. The helper child is bounded by its own
 * 6 h cap plus a finite runner timeout, and runs under a `deps.aborts` signal that stdin-EOF
 * release aborts. Aborting the child does not stop a move Steam already started.
 */
import { realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { InstallResult } from 'common/types/game_manager'
import { logInfo, LogPrefix } from 'backend/logger'
import type SteamGame from './games'
import { isContainedWithin } from './bridge/bridgeScan'
import { listSteamLibraryTargets } from './installLocation'
import { refreshInstallState } from './library/refresh'
import { readRunningAppId } from './library/runningPoll'
import {
  createSteamInstallAppRun,
  requestSteamMoveApp
} from './steamInstallApp'

// EAppState bits that mean Steam still reports a problem with the files.
const STATE_FILES_MISSING = 0x20
const STATE_FILES_CORRUPT = 0x80

/** The collaborators a move reaches; a test passes fakes instead of mocking the modules. */
interface MoveNativeCollaborators {
  requestMove: typeof requestSteamMoveApp
  readRunningApp: typeof readRunningAppId
  createRun: typeof createSteamInstallAppRun
  listLibraries: typeof listSteamLibraryTargets
  reconcile: typeof refreshInstallState
  platform: NodeJS.Platform
}

const defaultCollaborators: MoveNativeCollaborators = {
  requestMove: requestSteamMoveApp,
  readRunningApp: readRunningAppId,
  createRun: createSteamInstallAppRun,
  listLibraries: listSteamLibraryTargets,
  reconcile: refreshInstallState,
  platform: process.platform
}

function canonical(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}

const fail = (error: string): InstallResult => ({ status: 'error', error })

export async function moveRegisteredSteamGame(
  steamGame: SteamGame,
  newInstallPath: string,
  collab: MoveNativeCollaborators = defaultCollaborators
): Promise<InstallResult> {
  const { deps, appId } = steamGame
  const title = steamGame.getGameInfo().title

  if (collab.platform !== 'darwin') {
    return fail(
      'GameLib can move Steam games on macOS only. In Steam, use Properties → Installed Files → Move install folder.'
    )
  }

  const runningAppId = await collab.readRunningApp(deps)
  if (runningAppId !== 0 && String(runningAppId) === appId) {
    return fail(`Quit ${title} before moving it.`)
  }

  let libraries: Awaited<ReturnType<typeof listSteamLibraryTargets>> = []
  try {
    libraries = await collab.listLibraries(deps)
  } catch {
    // Falls through to the no-match refusal below, which names no libraries.
  }
  const wanted = canonical(newInstallPath)
  const target =
    libraries.find((l) => canonical(l.path) === wanted) ??
    libraries.find((l) => canonical(l.steamappsDir) === wanted) ??
    libraries.find((l) => canonical(join(l.steamappsDir, 'common')) === wanted)
  if (!target) {
    return fail(
      `Choose one of Steam's library folders: ${libraries.map((l) => l.path).join(', ')}. To use another drive, add it in Steam → Settings → Storage first.`
    )
  }

  const alreadyThere = `${title} is already in that Steam library.`
  const currentPath = steamGame.getGameInfo().install?.install_path
  if (
    currentPath &&
    isContainedWithin(canonical(target.steamappsDir), canonical(currentPath))
  ) {
    return fail(alreadyThere)
  }

  const reused =
    deps.aborts.has(appId) && deps.aborts.getSignal(appId)?.aborted === false
  const signal = reused
    ? deps.aborts.getSignal(appId)
    : deps.aborts.create(appId).signal
  try {
    const outcome = await collab.requestMove(
      appId,
      { libraryPath: target.path, wait: true, signal },
      { paths: deps.paths, run: collab.createRun({ runner: deps.runner }) }
    )

    if (outcome.kind === 'ok' && outcome.tracked && outcome.finished) {
      await collab.reconcile(deps)
      const state = outcome.installState
      if (
        state !== null &&
        (state & (STATE_FILES_MISSING | STATE_FILES_CORRUPT)) !== 0
      ) {
        return fail(
          `Steam moved ${title} but reports files missing or corrupt. Run Verify.`
        )
      }
      const newPath = steamGame.getGameInfo().install?.install_path
      if (
        newPath &&
        isContainedWithin(canonical(target.steamappsDir), canonical(newPath))
      ) {
        logInfo(
          `SteamGame: Steam moved appId ${appId} into ${target.path} (installState ${String(state)})`,
          LogPrefix.Steam
        )
        return { status: 'done' }
      }
      return fail(
        `Steam moved ${title}, but GameLib couldn't read its new location. Refresh the Steam library to pick it up.`
      )
    }
    if (outcome.kind === 'ok') {
      await collab.reconcile(deps)
      return fail(
        `Steam didn't confirm the move of ${title} finished (${outcome.reason ?? 'untracked'}). Check Steam → Settings → Storage, then Refresh the Steam library.`
      )
    }
    if (outcome.kind === 'refused') {
      if (outcome.reason === 'already-in-folder') return fail(alreadyThere)
      if (outcome.reason === 'not-installed') {
        return fail(`Steam doesn't have ${title} installed.`)
      }
      return fail(`Steam refused to move ${title} (${outcome.reason}).`)
    }
    if (outcome.kind === 'error') {
      return fail(
        `Steam refused to move ${title} (${outcome.stage} error ${String(outcome.code)}).`
      )
    }

    if (signal?.aborted) return { status: 'abort' }
    if (outcome.reason === 'library-not-registered') {
      return fail("Steam doesn't list that folder as one of its libraries.")
    }
    return fail(
      `GameLib couldn't reach Steam to move ${title} (${outcome.reason}). Make sure Steam is running and signed in, or use Properties → Installed Files → Move install folder in Steam.`
    )
  } finally {
    if (!reused && signal && deps.aborts.getSignal(appId) === signal) {
      deps.aborts.delete(appId)
    }
  }
}
