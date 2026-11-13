// quick-261027-cux: "Delete Files" for a cancelled Steam native download.
//
// Native layout finding: the native installer has NO separate staging or
// downloading tree. downloadSteamDepots writes straight into
// <steamappsDir>/common/<installdir>/ and its finalize() writes
// appmanifest_<appId>.acf (via appmanifest_<appId>.acf.tmp) on every outcome,
// cancel included. So the exact residue of a cancelled run is those three
// paths, and only those are removed. steamapps/downloading, temp, depotcache
// and the shared-redist cache belong to the Steam client / other games and are
// never touched.
//
// Settle ordering: runNativeDepotDownload calls markSteamInstallIncomplete on
// its cancelled branch and only then drops the appId from nativeInstallsInFlight
// (finally). cancelCurrentDownload is synchronous and does not wait for the
// abort, so this module waits for isNativeInstallInFlight to go false before
// deleting. After that the late markSteamInstallIncomplete has already run and
// cannot re-set the resume flag once we clear it.
//
// Two guards keep a pre-existing complete install safe (todo
// 2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install): the
// breadcrumb's steamResumeInstalledAtStart (captured at job start, immune to
// what finalize wrote since) and the current ACF StateFlags & 4.
//
// Targets come ONLY from the 260821-rb5 breadcrumb on the library entry
// (steamResumeTargetSteamappsDir / steamResumeInstalldir), the values the run
// actually resolved. Never re-derived.
//
// D-UAT-11 (quick-261029-o5a): a successful delete also zeroes the frontend progress.

import type { StatusUpdateDeps } from 'backend/appRuntime'
import { rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  getSteamLibraries,
  type SteamLibrariesDeps,
  sendProgressUpdate
} from 'backend/utils'
import { clearSteamResumeBreadcrumb } from './library/resumeBreadcrumbs'
import { findOtherManifestsWithInstalldir } from './library/acfState'
import { getBridgeBottleSteamappsRoot } from './library/installRoot'
import { getBottleSteamappsDir, type BottleSettingsDeps } from './bottle'
import { sanitizeInstalldir } from './installLocation'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { invokeSteamFiles } from './localFiles/rustSteamFiles'
import { NUMERIC_APP_ID } from './gameConstants'
import type { SteamStoresDeps } from './library/installRoot'
import type {
  SteamGameSessionDeps,
  SteamLibraryStateDeps
} from 'backend/services/types'

/** Local copy by directory convention (see library.ts). */

export const CANCEL_DELETE_POLL_MS = 100
export const CANCEL_DELETE_TIMEOUT_MS = 60000

type CancelDeleteResult = { status: 'deleted' | 'refused'; reason?: string }

function refuse(appId: string, reason: string): CancelDeleteResult {
  logWarning(
    `SteamCancelDelete: refused appId ${appId} — ${reason}`,
    LogPrefix.Steam
  )
  return { status: 'refused', reason }
}

async function collectAllowedRoots(
  deps: SteamLibrariesDeps & BottleSettingsDeps,
  appId: string
): Promise<Set<string>> {
  const roots = new Set<string>()
  try {
    for (const lib of await getSteamLibraries(deps)) {
      roots.add(resolve(lib, 'steamapps'))
    }
  } catch {
    /* other sources still count */
  }
  try {
    roots.add(
      resolve(
        getBottleSteamappsDir(
          deps.paths,
          deps.steamBottle.getSteamBottleSettings().wineCrossoverBottle
        )
      )
    )
  } catch {
    /* ignore */
  }
  try {
    roots.add(resolve(getBridgeBottleSteamappsRoot(deps, appId)))
  } catch {
    /* ignore */
  }
  return roots
}

/**
 * Removes the partial native install of a cancelled Steam download and clears
 * the resume breadcrumb. Never throws; every refusal keeps files and flag.
 */
export async function deleteCancelledSteamInstall(
  deps: SteamStoresDeps &
    SteamLibrariesDeps &
    BottleSettingsDeps &
    SteamLibraryStateDeps &
    SteamGameSessionDeps &
    StatusUpdateDeps,
  appId: string,
  opts?: { pollMs?: number; timeoutMs?: number }
): Promise<CancelDeleteResult> {
  try {
    if (!NUMERIC_APP_ID.test(appId)) {
      return refuse(appId, 'invalid appId')
    }

    const pollMs = opts?.pollMs ?? CANCEL_DELETE_POLL_MS
    const timeoutMs = opts?.timeoutMs ?? CANCEL_DELETE_TIMEOUT_MS
    const start = Date.now()
    while (deps.steamSession.gameSession.isNativeInstallInFlight(appId)) {
      if (Date.now() - start >= timeoutMs) {
        return refuse(appId, 'native install still settling')
      }
      await new Promise<void>((res) => {
        const t = setTimeout(res, pollMs)
        t.unref?.()
      })
    }

    const allowedRoots = await collectAllowedRoots(deps, appId)

    // Synchronous from here: nothing can start between checks and rmSync.
    if (deps.steamSession.gameSession.isNativeInstallInFlight(appId)) {
      return refuse(appId, 'install restarted')
    }

    const entry = deps.steamSession.libraryState.library.get(appId)
    if (!entry || entry.install?.steamResumePending !== true) {
      return refuse(appId, 'no resumable partial install recorded')
    }

    // Guard 1 (todo 2026-11-09): the title was already installed when the job
    // started. A cancelled job's finalize may have downgraded the manifest to
    // 1026 since, so the on-disk check below cannot be trusted alone.
    if (entry.install.steamResumeInstalledAtStart === true) {
      return refuse(appId, 'title was installed when the job started')
    }

    const targetSteamappsDir = entry.install.steamResumeTargetSteamappsDir
    const installdir = entry.install.steamResumeInstalldir
    if (
      typeof targetSteamappsDir !== 'string' ||
      !targetSteamappsDir.trim() ||
      typeof installdir !== 'string' ||
      !installdir.trim()
    ) {
      return refuse(appId, 'breadcrumb incomplete')
    }

    if (!allowedRoots.has(resolve(targetSteamappsDir))) {
      return refuse(appId, 'steamapps dir is not a known library or bottle')
    }

    try {
      if (
        sanitizeInstalldir(installdir, appId, targetSteamappsDir) !== installdir
      ) {
        return refuse(appId, 'installdir changed by sanitizer')
      }
    } catch {
      return refuse(appId, 'unsafe installdir')
    }

    const steamappsRoot = resolve(targetSteamappsDir)
    const commonRoot = resolve(targetSteamappsDir, 'common')
    const installRoot = resolve(commonRoot, installdir)
    const rel = relative(commonRoot, installRoot)
    if (
      !rel ||
      rel.includes(sep) ||
      rel.startsWith('..') ||
      isAbsolute(rel) ||
      installRoot === commonRoot ||
      installRoot === steamappsRoot
    ) {
      return refuse(appId, 'installdir not a single segment under common/')
    }

    const manifestPath = join(targetSteamappsDir, `appmanifest_${appId}.acf`)
    let read
    try {
      read = await invokeSteamFiles(deps, RUST_STEAMFILES_READ_ACF, {
        path: manifestPath
      })
    } catch {
      // T-75-56: cannot tell whether Steam reports it installed -> refuse.
      return refuse(appId, 'manifest unreadable')
    }
    if (read.exists && read.parsed && (read.record?.stateFlags ?? 0) & 4) {
      return refuse(appId, 'manifest reports installed')
    }
    // exists but unparseable is residue, not a refusal

    const conflicting = await findOtherManifestsWithInstalldir(
      deps,
      targetSteamappsDir,
      installdir,
      appId
    )

    // The Rust reads above awaited; re-check nothing started meanwhile.
    if (deps.steamSession.gameSession.isNativeInstallInFlight(appId)) {
      return refuse(appId, 'install restarted')
    }

    try {
      if (conflicting.length === 0) {
        rmSync(installRoot, { recursive: true, force: true })
      } else {
        logWarning(
          `SteamCancelDelete: appId ${appId} installdir shared with ${conflicting.join(', ')}; keeping directory`,
          LogPrefix.Steam
        )
      }
      rmSync(`${manifestPath}.tmp`, { force: true })
      rmSync(manifestPath, { force: true })
    } catch (error) {
      logWarning(
        `SteamCancelDelete: delete failed for appId ${appId}: ${String(error)}`,
        LogPrefix.Steam
      )
      return { status: 'refused', reason: 'delete failed' }
    }

    clearSteamResumeBreadcrumb(deps, appId)
    // D-UAT-11: the stale percent lives in the frontend store
    // useInstallProgressRaw[`${appId}_steam`], mirrored by every mounted
    // hasProgress. Emitting here is the last word: the in-flight settle wait
    // above guarantees no later depot emit can re-seed the old percent. A zero
    // value, not a deleted key, is required because hasProgress's effect
    // ignores an undefined store value.
    sendProgressUpdate(deps, {
      appName: appId,
      runner: 'steam',
      status: 'done',
      progress: { percent: 0, bytes: '0.00MB', eta: '' }
    })
    logInfo(
      `SteamCancelDelete: removed partial install for appId ${appId} (${installRoot})`,
      LogPrefix.Steam
    )
    return { status: 'deleted' }
  } catch (error) {
    return refuse(appId, `unexpected error: ${String(error)}`)
  }
}
