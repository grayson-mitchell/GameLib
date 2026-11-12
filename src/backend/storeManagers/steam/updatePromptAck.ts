/**
 * Phase 74 D-06: the "Don't ask again for this build" acknowledgement for the bridge pre-launch
 * update prompt. One value per appId: the target build id the user dismissed the prompt for. A
 * newer build id no longer equals it, so the prompt returns when a newer build ships.
 *
 * LEAF module: never throws, does nothing at import. Disk content is untrusted and safe-parsed.
 */
import type { SteamStoresDeps } from './library/installRoot'

interface AckStore {
  get: (key: string) => unknown
  set: (key: string, value: string) => void
}

const NUMERIC = /^\d{1,20}$/

function storeFrom(deps: SteamStoresDeps): AckStore {
  return deps.stores.steam.steamUpdatePromptAckStore as unknown as AckStore
}

export function readUpdatePromptAck(
  deps: SteamStoresDeps,
  appId: string
): string | undefined {
  try {
    if (!NUMERIC.test(appId)) return undefined
    const v = storeFrom(deps).get(appId)
    return typeof v === 'string' && NUMERIC.test(v) ? v : undefined
  } catch {
    return undefined
  }
}

export function recordUpdatePromptAck(
  deps: SteamStoresDeps,
  appId: string,
  targetBuild: string
): void {
  try {
    if (!NUMERIC.test(appId) || !NUMERIC.test(targetBuild)) return
    storeFrom(deps).set(appId, targetBuild)
  } catch {
    // an ack that cannot be saved just means the prompt shows again
  }
}
