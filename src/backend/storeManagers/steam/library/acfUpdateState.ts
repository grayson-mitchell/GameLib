/**
 * Reads the update-relevant fields of one app's ACF (build ids as raw strings, download counters,
 * StateFlags) and decides whether a Steam-registered install has an update pending, from the ACF alone.
 */
import { join } from 'path'
import { getSteamLibraries, type SteamLibrariesDeps } from 'backend/utils'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { NUMERIC_APP_ID } from '../gameConstants'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'
import type { BottleSettingsDeps } from '../bottle'
import {
  type AcfSource,
  getBottleSteamappsRoot,
  getBridgeBottleSteamappsRoot
} from './installRoot'

/** StateFlags bit 4: "fully installed". */
export const STATE_FLAG_FULLY_INSTALLED = 0x4

export interface AcfUpdateFields {
  steamappsDir: string
  buildid: string
  targetBuildId?: string
  stateFlags: number
  bytesToDownload: number
  bytesDownloaded: number
  scheduledAutoUpdate: number
  betaKey?: string
}

/** Steam sets StateFlags bit 0x2 (UpdateRequired) while an update is pending. */
const STATE_FLAG_UPDATE_REQUIRED = 0x2

export async function readAcfUpdateState(
  deps: SteamLibrariesDeps & BottleSettingsDeps & RustInvokeDeps,
  appId: string,
  source: AcfSource = 'native'
): Promise<AcfUpdateFields | null> {
  if (!NUMERIC_APP_ID.test(appId)) return null
  let steamappsDirs: string[]
  try {
    steamappsDirs =
      source === 'bottle'
        ? [getBottleSteamappsRoot(deps)]
        : source === 'bridge'
          ? [getBridgeBottleSteamappsRoot(deps, appId)]
          : (await getSteamLibraries(deps)).map((p) => join(p, 'steamapps'))
  } catch {
    return null
  }

  for (const steamappsDir of steamappsDirs) {
    const fields = await readAcfUpdateFieldsFromDir(deps, steamappsDir, appId)
    if (fields) return fields
  }
  return null
}

/** Reads one steamapps dir's manifest for `appId`; null when absent or corrupt. */
export async function readAcfUpdateFieldsFromDir(
  rust: RustInvokeDeps,
  steamappsDir: string,
  appId: string
): Promise<AcfUpdateFields | null> {
  if (!NUMERIC_APP_ID.test(appId)) return null
  try {
    const res = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path: join(steamappsDir, `appmanifest_${appId}.acf`)
    })
    const rec = res.record
    if (!res.exists || !res.parsed || !rec || rec.buildid === null) return null
    return {
      steamappsDir,
      buildid: rec.buildid,
      targetBuildId: rec.targetBuildId ?? undefined,
      stateFlags: rec.stateFlags ?? 0,
      bytesToDownload: Number(rec.bytesToDownload) || 0,
      bytesDownloaded: Number(rec.bytesDownloaded) || 0,
      scheduledAutoUpdate: Number(rec.scheduledAutoUpdate) || 0,
      ...(rec.betaKey ? { betaKey: rec.betaKey } : {})
    }
  } catch {
    return null
  }
}

/**
 * Pending when StateFlags carries UpdateRequired, or TargetBuildID is a real build different from
 * buildid, or an update is scheduled with bytes still to fetch. A bare non-zero BytesToDownload is
 * not enough: Steam leaves the last download's counters in an up-to-date ACF.
 */
export function isAcfUpdatePending(f: AcfUpdateFields): boolean {
  if ((f.stateFlags & STATE_FLAG_UPDATE_REQUIRED) !== 0) return true
  const target = f.targetBuildId
  if (target && target !== '0' && target !== f.buildid) return true
  return f.scheduledAutoUpdate > 0 && f.bytesToDownload > f.bytesDownloaded
}
