/**
 * Reads the update-relevant fields of one app's ACF (build ids as raw strings, download counters,
 * StateFlags) and decides whether a Steam-registered install has an update pending, from the ACF alone.
 */
import { join } from 'path'
import { existsSync, readFileSync } from 'graceful-fs'
import { getSteamLibraries, type SteamLibrariesDeps } from 'backend/utils'
import { NUMERIC_APP_ID } from '../gameConstants'
import type { BottleSettingsDeps } from '../bottle'
import { acfBlock, acfString, parseAcfTree } from '../acfInstalledDepots'
import {
  type AcfSource,
  getBottleSteamappsRoot,
  getBridgeBottleSteamappsRoot
} from './installRoot'

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
  deps: SteamLibrariesDeps & BottleSettingsDeps,
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
    const file = join(steamappsDir, `appmanifest_${appId}.acf`)
    try {
      if (!existsSync(file)) continue
      const state = acfBlock(
        parseAcfTree(readFileSync(file, 'utf-8')),
        'AppState'
      )
      const buildid = acfString(state, 'buildid')
      if (!state || buildid === undefined) continue
      const beta = acfString(acfBlock(state, 'UserConfig'), 'BetaKey')
      return {
        steamappsDir,
        buildid,
        targetBuildId: acfString(state, 'TargetBuildID'),
        stateFlags: parseInt(acfString(state, 'StateFlags') ?? '0', 10) || 0,
        bytesToDownload: Number(acfString(state, 'BytesToDownload')) || 0,
        bytesDownloaded: Number(acfString(state, 'BytesDownloaded')) || 0,
        scheduledAutoUpdate:
          Number(acfString(state, 'ScheduledAutoUpdate')) || 0,
        ...(beta ? { betaKey: beta } : {})
      }
    } catch {
      continue
    }
  }
  return null
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
