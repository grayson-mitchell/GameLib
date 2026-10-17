/**
 * Phase 51 Plan 07 -- RED stub. Implementation lands in the GREEN commit.
 */

import type { SteamBridgeVerdict } from '../electronStores'
import type {
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason,
  SteamBridgeRouteVerdict
} from 'common/types/steam'

export const NOTICE_REASONS: ReadonlySet<SteamBridgeRouteReason> = new Set()

export interface BridgeRouteInput {
  platformsBottleEligible: boolean
  isSeed: boolean
  knownBadReason: SteamBridgeKnownBadReason | null
  verdict: SteamBridgeVerdict | undefined
  failedThisSession: boolean
  win64ShimPresent: boolean
}

export function resolveBridgeRoute(
  _input: BridgeRouteInput
): SteamBridgeRouteVerdict {
  throw new Error('not implemented')
}
