import type { Runner } from 'common/types'

interface EpicOfflineModeInput {
  offlineMode: boolean
  runner: Runner
  canRunOffline: boolean
  storeExpired: boolean
}

/**
 * R8 (Phase 49): an expired Epic store is treated like `offlineMode` for games
 * that can run offline.
 *
 * This function can only ENABLE offline mode, for a `legendary` game that
 * `canRunOffline` while the store is `expired`. It never turns offline mode
 * off and it never blocks a launch. Every other runner is returned unchanged.
 * The launch-time "No saved credentials" modal in `backend/utils.ts` stays as
 * the fallback for games that cannot run offline.
 */
export function resolveEpicOfflineMode(input: EpicOfflineModeInput): boolean {
  return (
    input.offlineMode ||
    (input.runner === 'legendary' && input.canRunOffline && input.storeExpired)
  )
}
