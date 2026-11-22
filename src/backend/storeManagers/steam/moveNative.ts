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
 * The destination is not trusted. It is either one of Steam's registered library folders (the
 * library root, its steamapps, or steamapps/common), which moves exactly as before, or (quick
 * 261122-n4q, spike 094) any other existing folder, which the helper first registers with
 * AddLibraryFolder and then moves into at the index that call returned. The picked folder becomes
 * the library root: the game lands in `<picked>/steamapps/common/<installdir>`. This module refuses,
 * before any Steam call, a folder that does not exist, is not writable, is too long for Steam, is
 * or holds the game's current install, nests with an existing library, or already holds a copy of
 * the game; the helper re-checks existence, length and nesting against Steam's live folder list.
 * GameLib itself never creates, writes or deletes anything in the folder or in game files.
 *
 * Exit contract: this module creates no timers or handles. The helper child is bounded by its own
 * 6 h cap plus a finite runner timeout, and runs under a `deps.aborts` signal that stdin-EOF
 * release aborts. Aborting the child does not stop a move Steam already started.
 */
import {
  accessSync,
  constants,
  existsSync,
  realpathSync,
  statSync
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { InstallResult } from 'common/types/game_manager'
import { logInfo, LogPrefix } from 'backend/logger'
import type SteamGame from './games'
import { isContainedWithin } from './bridge/bridgeScan'
import { listSteamLibraryTargets } from './installLocation'
import { refreshInstallState } from './library/refresh'
import { readRunningAppId } from './library/runningPoll'
import {
  createSteamInstallAppRun,
  requestSteamMoveApp,
  STEAM_LIBRARY_PATH_MAX_BYTES
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

const notExistingMessage = (p: string) =>
  `${p} isn't an existing folder. Pick a folder that exists (create it first if needed).`
const tooLongMessage = () =>
  `That folder's path is too long for Steam (over ${STEAM_LIBRARY_PATH_MAX_BYTES} bytes). Pick a folder with a shorter path.`

/** The path of an existing copy of the game inside `steamappsDir`, if there is one. */
function findExistingCopy(
  steamappsDir: string,
  appId: string,
  installPath: string | undefined
): string | null {
  const candidates = [join(steamappsDir, `appmanifest_${appId}.acf`)]
  if (installPath) {
    candidates.unshift(join(steamappsDir, 'common', basename(installPath)))
  }
  return candidates.find((c) => existsSync(c)) ?? null
}

/**
 * The checks that run before a folder Steam does not list is offered to AddLibraryFolder. Returns
 * a refusal message, or the real path of the picked folder.
 */
function checkNewFolder(
  newInstallPath: string,
  currentPath: string | undefined,
  libraries: { path: string }[],
  title: string
): string | { picked: string } {
  let picked: string
  try {
    picked = realpathSync(newInstallPath)
    if (!statSync(picked).isDirectory())
      return notExistingMessage(newInstallPath)
  } catch {
    return notExistingMessage(newInstallPath)
  }
  try {
    accessSync(picked, constants.W_OK)
  } catch {
    return `GameLib can't write to ${picked}. Pick a folder you can write to.`
  }
  if (Buffer.byteLength(picked) > STEAM_LIBRARY_PATH_MAX_BYTES) {
    return tooLongMessage()
  }
  if (currentPath) {
    const cur = canonical(currentPath)
    if (picked === cur || isContainedWithin(cur, picked)) {
      return `That folder is where ${title} is installed now. Pick a folder outside it.`
    }
    if (isContainedWithin(picked, cur)) {
      return `That folder contains ${title}'s current install. Pick a different folder.`
    }
  }
  for (const l of libraries) {
    const root = canonical(l.path)
    if (isContainedWithin(root, picked)) {
      return `That folder is inside the Steam library ${l.path}. Pick ${l.path} itself to move ${title} there, or a folder outside it.`
    }
    if (isContainedWithin(picked, root)) {
      return `That folder contains the Steam library ${l.path}, and Steam can't nest one library inside another. Pick a different folder.`
    }
  }
  return { picked }
}

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
    return fail(
      "GameLib couldn't read Steam's library list, so it can't check that folder. Make sure Steam is installed, then try again."
    )
  }
  const wanted = canonical(newInstallPath)
  const target =
    libraries.find((l) => canonical(l.path) === wanted) ??
    libraries.find((l) => canonical(l.steamappsDir) === wanted) ??
    libraries.find((l) => canonical(join(l.steamappsDir, 'common')) === wanted)

  const alreadyThere = `${title} is already in that Steam library.`
  const currentPath = steamGame.getGameInfo().install?.install_path

  // The library root handed to the helper, and whether it must be registered first.
  let libraryRoot: string
  let addLibrary = false
  let steamappsDir: string
  if (target) {
    if (
      currentPath &&
      isContainedWithin(canonical(target.steamappsDir), canonical(currentPath))
    ) {
      return fail(alreadyThere)
    }
    libraryRoot = target.path
    steamappsDir = target.steamappsDir
  } else {
    const refusal = checkNewFolder(
      newInstallPath,
      currentPath,
      libraries,
      title
    )
    if (typeof refusal === 'string') return fail(refusal)
    libraryRoot = refusal.picked
    steamappsDir = join(refusal.picked, 'steamapps')
    addLibrary = true
  }

  const collision = findExistingCopy(steamappsDir, appId, currentPath)
  if (collision) {
    return fail(
      `${libraryRoot} already holds a copy of ${title} (${collision}). Move or delete it first, or pick another folder.`
    )
  }

  const reused =
    deps.aborts.has(appId) && deps.aborts.getSignal(appId)?.aborted === false
  const signal = reused
    ? deps.aborts.getSignal(appId)
    : deps.aborts.create(appId).signal
  try {
    const outcome = await collab.requestMove(
      appId,
      {
        libraryPath: libraryRoot,
        wait: true,
        signal,
        ...(addLibrary ? { addLibrary: true } : {})
      },
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
        isContainedWithin(canonical(steamappsDir), canonical(newPath))
      ) {
        logInfo(
          outcome.addedLibrary
            ? `SteamGame: Steam added ${libraryRoot} as a library and moved appId ${appId} into it (installState ${String(state)})`
            : `SteamGame: Steam moved appId ${appId} into ${libraryRoot} (installState ${String(state)})`,
          LogPrefix.Steam
        )
        return { status: 'done' }
      }
      return fail(
        `Steam moved ${title}, but GameLib couldn't read its new location. Refresh the Steam library to pick it up.`
      )
    }
    if (outcome.kind === 'not-settled') {
      // The files moved, so install_path must follow even though Steam's verify has not settled.
      await collab.reconcile(deps)
      const prefix = outcome.addedLibrary
        ? `Steam added ${libraryRoot} as a library. `
        : ''
      return fail(
        `${prefix}Steam moved ${title} into ${libraryRoot}, but its file check hasn't finished (${outcome.reason}). Run Verify on ${title}, or let Steam finish it in Downloads.`
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
      switch (outcome.reason) {
        case 'inside-library':
          return fail(
            "That folder is inside one of Steam's libraries. Pick the library folder itself, or a folder outside it."
          )
        case 'contains-library':
          return fail(
            "That folder contains one of Steam's libraries, and Steam can't nest one library inside another. Pick a different folder."
          )
        case 'library-not-directory':
          return fail(notExistingMessage(newInstallPath))
        case 'path-too-long':
          return fail(tooLongMessage())
        case 'add-library-refused':
          return fail(
            `Steam wouldn't add ${libraryRoot} as a library, so ${title} wasn't moved.`
          )
        case 'add-library-unverified':
          return fail(
            `Steam may have added ${libraryRoot} as a library, but GameLib couldn't confirm it, so ${title} wasn't moved. Check Steam → Settings → Storage.`
          )
      }
      return fail(`Steam refused to move ${title} (${outcome.reason}).`)
    }
    if (outcome.kind === 'error') {
      if (outcome.addedLibrary) {
        return fail(
          `Steam added ${libraryRoot} as a library but refused to move ${title} (${outcome.stage} error ${String(outcome.code)}).`
        )
      }
      return fail(
        `Steam refused to move ${title} (${outcome.stage} error ${String(outcome.code)}).`
      )
    }

    if (signal?.aborted) return { status: 'abort' }
    if (outcome.reason === 'library-not-registered') {
      return fail("Steam doesn't list that folder as one of its libraries.")
    }
    if (outcome.reason === 'method-unverified:AddLibraryFolder') {
      return fail(
        `This Steam version doesn't let GameLib add ${libraryRoot} as a library. Add it in Steam → Settings → Storage, then move ${title} there.`
      )
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
