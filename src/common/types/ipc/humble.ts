import { z } from 'zod'

import type {
  ClaimAnnotation,
  HumbleAuthState,
  HumbleKey,
  HumbleSyncState,
  HumbleUserData,
  HumbleValidationReport,
  RedeemOutcome
} from '../humble'
import {
  nonEmptyString,
  type InvokeFns,
  type PushFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

// Key identifiers only: no channel here receives a key value (D-10). The reveal value only
// ever travels back in humbleGetRevealedKeyValue's return.
const machineName = nonEmptyString(256)
const keyIdentity = z.strictObject({
  gamekey: nonEmptyString(256),
  machineName
})

export const humbleSyncArgs = {
  humbleDisconnect: noArgs
}

export const humbleAsyncArgs = {
  humbleGetUserInfo: noArgs,
  humbleCheckHealth: noArgs,
  // Dev-only D-12 validation trigger, wired only behind a dev-flag guard (T-10-16). Returns a
  // redacted HumbleValidationReport (D-15, no cookie/gamekey values).
  humbleRunValidation: noArgs,
  // Bounded-concurrency sync (D-23/D-25); never throws, failures surface via humbleGetSyncState.
  humbleSync: noArgs,
  // Display-safe key inventory from humbleLibraryStore (never the generic storeGet bridge).
  humbleGetKeys: noArgs,
  humbleGetSyncState: noArgs,
  // D-42: "Not the same game" override for a fuzzy-matched row; the backend re-validates.
  humbleSetOwnershipOverride: z.tuple([machineName]),
  humbleClearOwnershipOverride: z.tuple([machineName]),
  // WR-04: machineName -> overriddenAt (ms) for every recorded override.
  humbleGetOwnershipOverrides: noArgs,
  // D-59/D-57: confirms the "Open Humble" gift action; no gift-link value crosses the channel.
  humbleRecordGiftLinkOpened: z.tuple([machineName]),
  // machineName -> giftedAt (ms) so the Spares view can label an already-gifted key.
  humbleGetGiftedAt: noArgs,
  // HCLAIM-04, D-77: marks a key locally redeemed; the backend re-validates eligibility.
  humbleMarkRedeemed: z.tuple([keyIdentity]),
  // Reverses a local-only "Mark as redeemed"; never applicable to a server-confirmed redeem.
  humbleUndoRedeemed: z.tuple([keyIdentity]),
  // The previously-revealed key value (or null), looked up by id only (Pitfall B).
  humbleGetRevealedKeyValue: z.tuple([keyIdentity]),
  // Per-key reveal/redeem annotations keyed by `gamekey:machineName`.
  humbleGetClaimAnnotations: noArgs
}

interface HumbleAsyncReturns {
  humbleGetUserInfo: Promise<HumbleUserData | undefined>
  humbleCheckHealth: Promise<void>
  humbleRunValidation: Promise<HumbleValidationReport>
  humbleSync: Promise<{ status: 'ok' | 'partial' | 'failed' }>
  humbleGetKeys: Promise<HumbleKey[]>
  humbleGetSyncState: Promise<HumbleSyncState>
  humbleSetOwnershipOverride: Promise<void>
  humbleClearOwnershipOverride: Promise<void>
  humbleGetOwnershipOverrides: Promise<Record<string, number>>
  humbleRecordGiftLinkOpened: Promise<void>
  humbleGetGiftedAt: Promise<Record<string, number>>
  humbleMarkRedeemed: Promise<RedeemOutcome>
  humbleUndoRedeemed: Promise<void>
  humbleGetRevealedKeyValue: Promise<string | null>
  humbleGetClaimAnnotations: Promise<Record<string, ClaimAnnotation>>
}

const isObject = (v: unknown) => typeof v === 'object' && v !== null

// D-12: typing only, never parsed at runtime. Every payload is display-safe by type: no
// cookie, no key values.
export const humbleFrontendMessagesArgs = {
  openScreen: z.tuple([z.string()]),
  humbleAuthState: z.tuple([z.custom<HumbleAuthState>(isObject)]),
  humbleKeysUpdated: z.tuple([z.custom<HumbleKey[]>(Array.isArray)]),
  humbleSyncProgress: z.tuple([
    z.strictObject({ done: z.number(), total: z.number() })
  ]),
  humbleSyncStateChanged: z.tuple([z.custom<HumbleSyncState>(isObject)])
}

export type HumbleSync = SendFns<typeof humbleSyncArgs>
export type HumbleAsync = InvokeFns<typeof humbleAsyncArgs, HumbleAsyncReturns>
export type HumbleFrontendMessages = PushFns<typeof humbleFrontendMessagesArgs>
