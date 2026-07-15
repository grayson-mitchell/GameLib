// Phase 21 Plan 07 seam — Plan 09 owns the real implementation.
//
// SteamGame.install()'s native (opt-in ON, non-bottle) branch calls
// resolveSteamInstallTarget(appId, args) to get the { targetSteamappsDir,
// installdir } pair downloadSteamDepots (depot.ts, Plan 04-06) needs, so a
// future Plan 09 can implement the real Steam-library selection (multi-
// library picker, free-space check, existing-library reuse) WITHOUT
// re-touching games.ts — this file is the single seam Plan 07 wires against.
//
// This stub is intentionally minimal: it resolves the FIRST Steam library
// returned by getSteamLibraries() and uses the numeric appId as a
// placeholder installdir, so Plan 07's own install()/stop() wiring can be
// implemented and tested end-to-end now. Plan 09 replaces the body (not the
// exported signature) with the real target-resolution flow.

import { join } from 'path'
import type { InstallArgs } from 'common/types'
import { getSteamLibraries } from 'backend/utils'

export interface SteamInstallTarget {
  targetSteamappsDir: string
  installdir: string
}

/**
 * Resolves the steamapps dir + installdir a depot download should target.
 * Plan 07 stub: first Steam library's steamapps dir, appId as installdir.
 */
export async function resolveSteamInstallTarget(
  appId: string,
  _args: InstallArgs
): Promise<SteamInstallTarget> {
  const libraries = await getSteamLibraries()
  const targetSteamappsDir = join(libraries[0] ?? '', 'steamapps')
  return { targetSteamappsDir, installdir: appId }
}
