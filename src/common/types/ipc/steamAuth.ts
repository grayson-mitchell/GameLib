import { z } from 'zod'

import type {
  RedeemKeyResult,
  SteamBottleConfig,
  SteamBottleEligibilityVerdict,
  SteamBridgeRouteReason,
  SteamGoOfflineRetryResult,
  BridgeListFriendsResult,
  BridgeInviteResult,
  SteamBridgeRouteVerdict,
  SteamUserData
} from '../steam'

import {
  nonEmptyString,
  optionalArg,
  wineInstallationArg,
  type InvokeFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

/** A Steam appId in the string form callers send (digits only, bounded). */
function steamAppIdArg() {
  return z.string().regex(/^\d{1,10}$/)
}

// SteamBridgeRouteReason, listed so a rename fails the drift guard below.
const BRIDGE_ROUTE_REASONS = [
  'seed',
  'scan-clean',
  'pending-scan',
  'no-steam-api',
  'user-forced-bridge',
  'scan-miss',
  'known-bad',
  'win64-no-shim',
  'user-forced-bottle',
  'failed-this-session'
] as const
// Drift guard both ways: a reason added to or removed from the union fails tsc here.
type ReasonListMatchesUnion =
  SteamBridgeRouteReason extends (typeof BRIDGE_ROUTE_REASONS)[number]
    ? (typeof BRIDGE_ROUTE_REASONS)[number] extends SteamBridgeRouteReason
      ? true
      : never
    : never
const reasonListMatchesUnion: ReasonListMatchesUnion = true
void reasonListMatchesUnion

export const steamAuthSyncArgs = {
  logoutSteam: noArgs
}

export const steamAuthAsyncArgs = {
  steamStartQR: noArgs,
  steamPollQR: noArgs,
  steamPollCredential: noArgs,
  // Credentials are bounded only; their values never reach a log or a wire error (D-10).
  steamStartCredentials: z.tuple([
    z.strictObject({
      username: nonEmptyString(64),
      password: nonEmptyString(1024)
    })
  ]),
  steamSubmitGuard: z.tuple([nonEmptyString(16)]),
  redeemSteamKey: z.tuple([
    z.strictObject({
      store: z.literal('steam'),
      key: nonEmptyString(64)
    })
  ]),
  getSteamUserInfo: noArgs,
  checkSteamInstalled: noArgs,
  getSteamSyncedAt: noArgs,
  getSteamInstallSize: z.tuple([steamAppIdArg()]),
  // Phase 17 (17-04): provisions the dedicated Steam CrossOver bottle. Bottled-Steam auth
  // stays opaque (D-04).
  steamBottleProvision: z.tuple([
    optionalArg(
      z.strictObject({
        bottleName: nonEmptyString(256).optional(),
        wineVersion: wineInstallationArg().optional()
      })
    )
  ]),
  isSteamBottleProvisioned: noArgs,
  steamBottleStatus: noArgs,
  // Phase 34.13 (34.13-07): backend-authoritative bottle-eligibility verdict.
  isSteamBottleEligible: z.tuple([nonEmptyString(64)]),
  // Phase 51 Plan 03: composed bridge-vs-bottle route verdict for one game.
  getSteamBridgeRoute: z.tuple([steamAppIdArg(), optionalArg(z.boolean())]),
  // Phase 51 Plan 03: persists the user's own bridge/bottle override.
  setSteamBridgeUserRoute: z.tuple([
    z.strictObject({
      appId: steamAppIdArg(),
      userRoute: z.enum(['bottle', 'bridge']).nullable(),
      acknowledgeReason: z.enum(BRIDGE_ROUTE_REASONS).optional()
    })
  ]),
  // quick-260821-le0: sweeps every recorded install root for a Steam title.
  steamRemoveAllCopies: z.tuple([nonEmptyString(64)]),
  // Phase 54: sidecar-only guided Go Offline step.
  steamGoOfflineRetry: noArgs,
  steamGoOfflineCancel: noArgs,
  // Phase 58 Plan 31: sidecar-only friend picker channels.
  steamBridgeListFriends: z.tuple([steamAppIdArg()]),
  steamBridgeInviteFriend: z.tuple([
    steamAppIdArg(),
    z.number().int().nonnegative()
  ]),
  // Phase 34.13 (34.13-07), D-14: persists the install form's chosen wine engine.
  persistBottleWineVersion: z.tuple([wineInstallationArg()]),
  // Phase 21 (21-10), D-10: guided native Steam client install.
  steamClientSetupStart: noArgs,
  // Phase 21 (21-10), D-10/D-11: re-checks ensureSteamClientReady(appId).
  steamClientSetupRecheck: z.tuple([nonEmptyString(64)])
}

interface SteamAuthAsyncReturns {
  steamStartQR: Promise<{
    status: 'done' | 'error'
    challengeUrl?: string
  }>
  steamPollQR: Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }>
  steamPollCredential: Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }>
  steamStartCredentials: Promise<{
    status: 'done' | 'guard_required' | 'error'
  }>
  steamSubmitGuard: Promise<{ status: 'done' | 'error' }>
  redeemSteamKey: Promise<RedeemKeyResult>
  getSteamUserInfo: Promise<SteamUserData | undefined>
  checkSteamInstalled: Promise<boolean>
  getSteamSyncedAt: Promise<number | null>
  getSteamInstallSize: Promise<string>
  steamBottleProvision: Promise<{
    status: 'done' | 'error'
    error?: string
    errorCode?: 'crossover-missing'
  }>
  isSteamBottleProvisioned: Promise<boolean>
  steamBottleStatus: Promise<
    Pick<SteamBottleConfig, 'provisioned' | 'bottleName'>
  >
  isSteamBottleEligible: Promise<SteamBottleEligibilityVerdict>
  getSteamBridgeRoute: Promise<SteamBridgeRouteVerdict>
  setSteamBridgeUserRoute: Promise<{ ok: boolean; error?: string }>
  steamRemoveAllCopies: Promise<{
    removed: number
    refused: number
    error?: string
  }>
  steamGoOfflineRetry: Promise<SteamGoOfflineRetryResult>
  steamGoOfflineCancel: Promise<void>
  steamBridgeListFriends: Promise<BridgeListFriendsResult>
  steamBridgeInviteFriend: Promise<BridgeInviteResult>
  persistBottleWineVersion: Promise<{
    status: 'done' | 'error'
    error?: string
  }>
  steamClientSetupStart: Promise<{
    status: 'started' | 'link-opened' | 'error'
    error?: string
  }>
  steamClientSetupRecheck: Promise<{
    status: 'ready' | 'needs-install' | 'needs-launch'
    ready: boolean
    error?: string
  }>
}

export type SteamAuthSync = SendFns<typeof steamAuthSyncArgs>
export type SteamAuthAsync = InvokeFns<
  typeof steamAuthAsyncArgs,
  SteamAuthAsyncReturns
>
