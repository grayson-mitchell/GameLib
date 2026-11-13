/**
 * String-preserving ACF reader for update detection. Depot manifest GIDs are 19-digit integers that
 * exceed Number.MAX_SAFE_INTEGER, and a VDF parser that number-coerces values loses digits (spike
 * 070 step 1). This module scans the raw ACF text and never coerces: every value stays a string.
 */
import { join } from 'path'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { NUMERIC_APP_ID } from './gameConstants'
import { invokeSteamFiles } from './localFiles/rustSteamFiles'

export interface AcfInstalledDepot {
  depotId: string
  manifest: string
  size: string
  /** The DLC app that owns this depot (`dlcappid`), when the ACF records one. */
  dlcAppId?: string
}

const ID = /^\d{1,20}$/

/**
 * Installed depots and buildid of one app's ACF, every id an exact digit string. Null when the
 * app id is not numeric or the manifest is absent/unreadable. On the Rust path the one ACF
 * codec reads the file (steamfiles_read_acf) and the ids stay strings end to end.
 */
export async function readAcfInstalledDepots(
  rust: RustInvokeDeps,
  steamappsDir: string,
  appId: string
): Promise<{
  buildid: string | undefined
  installedDepots: AcfInstalledDepot[]
} | null> {
  if (!NUMERIC_APP_ID.test(appId)) return null
  try {
    const res = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path: join(steamappsDir, `appmanifest_${appId}.acf`)
    })
    if (!res.exists) return null
    const rec = res.record
    const buildid =
      rec?.buildid != null && ID.test(rec.buildid) ? rec.buildid : undefined
    return {
      buildid,
      installedDepots: (rec?.installedDepots ?? []).map((d) => ({
        depotId: d.depotId,
        manifest: d.manifest,
        size: ID.test(d.size) ? d.size : '0',
        ...(d.dlcAppId && ID.test(d.dlcAppId) && d.dlcAppId !== '0'
          ? { dlcAppId: d.dlcAppId }
          : {})
      }))
    }
  } catch {
    return null
  }
}
