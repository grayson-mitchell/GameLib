// Shared reader for the two appmanifest fields the stale-queue-head guards
// care about (todo 2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install,
// quick 261110-9db). Never throws. Phase 75: async on `steamfiles_read_acf`.

import { join } from 'path'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'
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
export async function readAppManifestFlags(
  rust: RustInvokeDeps,
  steamappsDir: string,
  appId: string
): Promise<AppManifestFlags | null> {
  try {
    const manifest = join(steamappsDir, `appmanifest_${appId}.acf`)
    const read = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path: manifest
    })
    const record = read.parsed ? read.record : null
    if (!record || record.stateFlags === null) return null
    return { stateFlags: record.stateFlags, buildid: record.buildid ?? '' }
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
