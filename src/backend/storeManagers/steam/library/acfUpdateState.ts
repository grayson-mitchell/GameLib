/**
 * Reads the update-relevant fields of one app's ACF (build ids as raw strings, download counters,
 * StateFlags) and decides whether a Steam-registered install has an update pending, from the ACF alone.
 */
import type { SteamLibrariesDeps } from 'backend/utils'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  RUST_STEAMPOLL_ACF_READ_UPDATE,
  RUST_STEAMPOLL_ACF_READ_UPDATE_FROM_DIR
} from 'common/types/sidecarTransport'
import { invokeSteamPoll, pollRootsFor } from '../pollRust/rustSteamPoll'
import type { AcfUpdateFields as RustAcfUpdateFields } from '../pollRust/steamPollTypes'
import { NUMERIC_APP_ID } from '../gameConstants'
import type { BottleSettingsDeps } from '../bottle'
import type { AcfSource } from './installRoot'

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
  try {
    const roots = pollRootsFor(deps, appId, source)
    return fromRust(
      (await invokeSteamPoll(deps, RUST_STEAMPOLL_ACF_READ_UPDATE, {
        roots,
        appId,
        source
      })) as RustAcfUpdateFields | null
    )
  } catch {
    return null
  }
}

/** The Rust shape carries nulls where the TS fields are optional. */
function fromRust(f: RustAcfUpdateFields | null): AcfUpdateFields | null {
  if (!f) return null
  const { targetBuildId, betaKey, ...rest } = f
  return {
    ...rest,
    ...(targetBuildId === null ? {} : { targetBuildId }),
    ...(betaKey ? { betaKey } : {})
  }
}

/** Reads one steamapps dir's manifest for `appId`; null when absent or corrupt. */
export async function readAcfUpdateFieldsFromDir(
  rust: RustInvokeDeps,
  steamappsDir: string,
  appId: string
): Promise<AcfUpdateFields | null> {
  if (!NUMERIC_APP_ID.test(appId)) return null
  try {
    return fromRust(
      (await invokeSteamPoll(rust, RUST_STEAMPOLL_ACF_READ_UPDATE_FROM_DIR, {
        steamappsDir,
        appId
      })) as RustAcfUpdateFields | null
    )
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
