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
// Targets come ONLY from the 260821-rb5 breadcrumb on the library entry
// (steamResumeTargetSteamappsDir / steamResumeInstalldir), the values the run
// actually resolved. Never re-derived.

import { parse } from '@node-steam/vdf'
import { readFileSync, existsSync } from 'graceful-fs'
import { rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { getSteamLibraries } from 'backend/utils'
import { library } from './state'
import { isNativeInstallInFlight } from './games'
import {
  clearSteamResumeBreadcrumb,
  findOtherManifestsWithInstalldir,
  getBridgeBottleSteamappsRoot
} from './library'
import { getBottleSteamappsDir, getSteamBottleSettings } from './bottle'
import { sanitizeInstalldir } from './installLocation'

/** Local copy by directory convention (see library.ts). */
const NUMERIC_APP_ID = /^\d+$/

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

async function collectAllowedRoots(appId: string): Promise<Set<string>> {
  const roots = new Set<string>()
  try {
    for (const lib of await getSteamLibraries()) {
      roots.add(resolve(lib, 'steamapps'))
    }
  } catch {
    /* other sources still count */
  }
  try {
    roots.add(
      resolve(
        getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)
      )
    )
  } catch {
    /* ignore */
  }
  try {
    roots.add(resolve(getBridgeBottleSteamappsRoot(appId)))
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
    while (isNativeInstallInFlight(appId)) {
      if (Date.now() - start >= timeoutMs) {
        return refuse(appId, 'native install still settling')
      }
      await new Promise<void>((res) => {
        const t = setTimeout(res, pollMs)
        t.unref?.()
      })
    }

    const allowedRoots = await collectAllowedRoots(appId)

    // Synchronous from here: nothing can start between checks and rmSync.
    if (isNativeInstallInFlight(appId)) {
      return refuse(appId, 'install restarted')
    }

    const entry = library.get(appId)
    if (!entry || entry.install?.steamResumePending !== true) {
      return refuse(appId, 'no resumable partial install recorded')
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
    if (existsSync(manifestPath)) {
      try {
        const parsed = parse(readFileSync(manifestPath, 'utf-8')) as {
          AppState?: { StateFlags?: string }
        }
        if (Number(parsed?.AppState?.StateFlags) & 4) {
          return refuse(appId, 'manifest reports installed')
        }
      } catch {
        /* unparseable ACF is residue, not a refusal */
      }
    }

    const conflicting = findOtherManifestsWithInstalldir(
      targetSteamappsDir,
      installdir,
      appId
    )

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

    clearSteamResumeBreadcrumb(appId)
    logInfo(
      `SteamCancelDelete: removed partial install for appId ${appId} (${installRoot})`,
      LogPrefix.Steam
    )
    return { status: 'deleted' }
  } catch (error) {
    return refuse(appId, `unexpected error: ${String(error)}`)
  }
}
