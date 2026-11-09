// Shared reader for the two appmanifest fields the stale-queue-head guards
// care about (todo 2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install,
// quick 261110-9db). Sync, never throws.

import { join } from 'path'
import { existsSync, readFileSync } from 'graceful-fs'
import { parse } from '@node-steam/vdf'
import { isFullyInstalledStateFlags } from './installedMap'

export interface AppManifestFlags {
  stateFlags: number
  /** '' when the manifest has no buildid. */
  buildid: string
}

/**
 * Reads StateFlags + buildid from `<steamappsDir>/appmanifest_<appId>.acf`.
 * Null when the file is missing, unparseable or StateFlags is not a number.
 */
export function readAppManifestFlags(
  steamappsDir: string,
  appId: string
): AppManifestFlags | null {
  try {
    const manifest = join(steamappsDir, `appmanifest_${appId}.acf`)
    if (!existsSync(manifest)) return null
    const parsed = parse(readFileSync(manifest, 'utf-8')) as {
      AppState?: { StateFlags?: string; buildid?: string }
    }
    const stateFlags = parseInt(parsed?.AppState?.StateFlags ?? '', 10)
    if (Number.isNaN(stateFlags)) return null
    const rawBuildid = parsed?.AppState?.buildid
    return {
      stateFlags,
      buildid: rawBuildid === undefined ? '' : String(rawBuildid)
    }
  } catch {
    return null
  }
}

const UPDATE_REQUIRED = 2

/**
 * A "current" full install: bit 4 (fully installed) set, bit 2
 * (UpdateRequired) clear, and a real buildid. There is no offline source for
 * the live PICS buildid, so Steam's own UpdateRequired bit is the
 * determinable proxy for "not stale".
 */
export function isCurrentFullInstall(flags: AppManifestFlags | null): boolean {
  if (!flags) return false
  return (
    isFullyInstalledStateFlags(flags.stateFlags) &&
    (flags.stateFlags & UPDATE_REQUIRED) === 0 &&
    flags.buildid !== '' &&
    flags.buildid !== '0'
  )
}
