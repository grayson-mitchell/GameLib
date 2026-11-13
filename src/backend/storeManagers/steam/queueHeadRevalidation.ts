// Layer 1 of todo 2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install
// (quick 261110-9db): a persisted Steam install queue head can become a
// complete install outside GameLib (Steam client takeover, manual install)
// while it sits in the queue. Starting it anyway ran a no-op job over the
// finished tree, and cancelling that job with Delete Files destroyed it.

import type { FrontendMessageDeps } from '../../host/frontendMessage'
import { join, resolve } from 'path'
import { logInfo, LogPrefix } from 'backend/logger'
import type { SteamLibraryStateDeps } from 'backend/services/types'
import { getSteamLibraries, type SteamLibrariesDeps } from 'backend/utils'
import { NUMERIC_APP_ID } from './gameConstants'
import type { SteamStoresDeps } from './library/installRoot'
import { clearSteamResumeBreadcrumb } from './library/resumeBreadcrumbs'
import {
  isCurrentFullInstall,
  readAppManifestFlags
} from './library/manifestFlags'

/**
 * True when the queue head's EXACT target appmanifest is already a current
 * full install; the resume breadcrumb is cleared in that case so the caller
 * can drop the head. Never throws (false on any doubt: dropping is the
 * non-destructive direction only when we are sure).
 *
 * Target resolution is exact-target-only so an intended second copy (bottle
 * vs native, see removeAllCopies.ts) is never blocked:
 *  (a) the breadcrumb's steamResumeTargetSteamappsDir, the dir the last run
 *      actually resolved; else
 *  (b) `<params.path>/steamapps`, only when params.path resolves to a
 *      registered library root. Finding: InstallArgs.path for Steam is a
 *      library ROOT (installLocation.resolveOverride matches it against
 *      getSteamLibraries(deps), and an empty or unregistered value silently
 *      becomes the primary library), never a steamapps dir. An empty or
 *      unregistered path therefore yields false here rather than guessing.
 *
 * "Current" is Task isCurrentFullInstall: StateFlags bit 4, UpdateRequired
 * bit 2 clear, real buildid. There is no offline source for the live PICS
 * buildid, so Steam's own UpdateRequired bit is the determinable proxy.
 */
export async function steamQueueHeadAlreadyInstalled(
  deps: SteamStoresDeps &
    SteamLibrariesDeps &
    SteamLibraryStateDeps &
    FrontendMessageDeps,
  appId: string,
  params: { path?: string }
): Promise<boolean> {
  try {
    if (!NUMERIC_APP_ID.test(appId)) return false

    let steamappsDir =
      deps.steamSession.libraryState.library.get(appId)?.install
        ?.steamResumeTargetSteamappsDir
    if (!steamappsDir) {
      const path = params?.path
      if (typeof path !== 'string' || !path.trim()) return false
      const resolved = resolve(path)
      const libs = await getSteamLibraries(deps)
      if (!libs.some((lib) => resolve(lib) === resolved)) return false
      steamappsDir = join(path, 'steamapps')
    }

    if (
      !isCurrentFullInstall(
        await readAppManifestFlags(deps, steamappsDir, appId)
      )
    ) {
      return false
    }

    clearSteamResumeBreadcrumb(deps, appId)
    logInfo(
      `${appId} is a queued Steam install but its appmanifest is already a current full install — dropping it from the queue (todo 2026-11-09)`,
      LogPrefix.Steam
    )
    return true
  } catch {
    return false
  }
}
