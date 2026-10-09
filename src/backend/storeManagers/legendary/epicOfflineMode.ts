import type { Runner } from 'common/types'

export interface EpicOfflineModeInput {
  offlineMode: boolean
  runner: Runner
  canRunOffline: boolean
  storeExpired: boolean
}

/**
 * RED stub (49-03 Task 3): returns the input unchanged. The GREEN commit adds
 * the expired-store rule.
 */
export function resolveEpicOfflineMode(input: EpicOfflineModeInput): boolean {
  return input.offlineMode
}
