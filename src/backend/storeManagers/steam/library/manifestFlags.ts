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

/**
 * WR-07 (75 review): whether the title must be treated as already installed
 * when a native depot job starts (feeds the breadcrumb's
 * steamResumeInstalledAtStart, which makes cancel-delete refuse). Unlike
 * readAppManifestFlags this never maps "could not read" to "not installed":
 * a manifest that exists but does not parse (truncated, oversized) or a
 * rejected read is answered `true`, the conservative side for a guard that
 * protects an install directory from deletion. Only a missing manifest or a
 * parsed one without bit 4 is `false`.
 */
export async function readInstalledAtStart(
  rust: RustInvokeDeps,
  steamappsDir: string,
  appId: string
): Promise<boolean> {
  let read
  try {
    read = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path: join(steamappsDir, `appmanifest_${appId}.acf`)
    })
  } catch {
    return true
  }
  if (!read.exists) return false
  if (!read.parsed || !read.record) return true
  return isFullyInstalledStateFlags(read.record.stateFlags ?? 0)
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
