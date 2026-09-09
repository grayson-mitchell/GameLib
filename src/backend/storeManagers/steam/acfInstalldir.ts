// quick-260909-pym: shared, single-source ACF installdir reader.
//
// Extracted so installLocation.ts and library.ts's locateDownloadingTarget
// can never silently diverge on how an installdir is read off an on-disk
// appmanifest_<appId>.acf (the same discipline D-03 already applies to
// sanitizeInstalldir having exactly one implementation).
//
// A LEAF module by design (import_direction_constraint): library.ts already
// imports from installLocation.ts, so installLocation.ts must never import
// from library.ts. This module imports from neither, and both of them import
// from it — no cycle.
//
// Per-directory, not per-library-list, on purpose: installLocation.ts needs
// the ACF in the ONE steamapps dir the install has already been targeted at
// (the resolveOverride/primary match), while library.ts's
// locateDownloadingTarget composes its own loop over getSteamLibraries() and
// calls this once per library. Looping belongs to the caller, not here.
//
// D-03 contract: this function returns the RAW on-disk value and performs NO
// sanitization. An ACF is attacker-writable by anyone who can already write
// into steamapps/ (T-pym-01), so every caller MUST funnel the result through
// the one shared sanitizeInstalldir(candidate, appId, steamappsDir) before it
// is used as a real filesystem write target.

import { existsSync, readFileSync } from 'graceful-fs'
import { parse } from '@node-steam/vdf'
import { join } from 'path'

/**
 * Reads `appmanifest_<appId>.acf` from `steamappsDir` and returns its
 * `AppState.installdir` string, or `undefined` when the manifest does not
 * exist, fails to parse, or has an absent/blank installdir. Never throws —
 * same discipline as library.ts's readAcfState/scanDownloadingAppIds (T-2-01):
 * a corrupt or missing ACF is a normal "nothing to report" outcome for a
 * caller that is only trying to find an existing install, not an error.
 */
export function readAcfInstalldir(
  steamappsDir: string,
  appId: string
): string | undefined {
  const manifestFile = join(steamappsDir, `appmanifest_${appId}.acf`)
  if (!existsSync(manifestFile)) {
    return undefined
  }

  try {
    const content = readFileSync(manifestFile, 'utf-8')
    const parsed = parse(content)
    const installdir = parsed?.AppState?.installdir
    if (typeof installdir !== 'string' || !installdir.trim()) {
      return undefined
    }
    return installdir
  } catch {
    return undefined // corrupt ACF — same discipline as readAcfState (T-2-01)
  }
}
