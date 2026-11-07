import { z } from 'zod'

import type { GameStatus, LaunchParams, StatusPromise } from '../../types'
import type {
  SteamBottleLaunchWaitingCause,
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason,
  SteamGoOfflinePayload,
  SteamRequestNoticePayload,
  SteamSetupDownloadProgress
} from '../steam'
import {
  nonEmptyString,
  optionalArg,
  phase70Passthrough,
  runnerArg,
  type InvokeFns,
  type PushFns
} from './schemaTypes'

// `origin` (quick-260817-d61) is observability + the Steam keyring deferral trigger ONLY: it
// must never carry user data, hence the tight bound.
const refreshOrigin = z.string().max(256)

// D-07: the envelope is checked (appName + runner, the identity the sidecar routes on); the
// launch options come from persisted game config, so the rest stays an explicit loose object
// that Phase 70 tightens. The cast keeps the derived call-site type the full LaunchParams
// (zod's loose-object input type carries an index signature LaunchParams cannot satisfy).
const launchParamsArg = phase70Passthrough({
  appName: nonEmptyString(256),
  runner: runnerArg(),
  skipVersionCheck: z.boolean().optional(),
  args: z.array(z.string().max(8192)).max(1024).optional()
}) as unknown as z.ZodType<LaunchParams, LaunchParams>

export const steamAsyncArgs = {
  refreshLibrary: z.tuple([
    optionalArg(z.union([runnerArg(), z.literal('all')])),
    optionalArg(refreshOrigin)
  ]),
  launch: z.tuple([launchParamsArg])
}

interface SteamAsyncReturns {
  refreshLibrary: Promise<void>
  launch: StatusPromise
}

// D-12: typing only, never parsed at runtime. Every payload originates in the backend, so the
// object arms are z.custom type carriers rather than strict shapes.
const isObject = (v: unknown) => typeof v === 'object' && v !== null

export const steamFrontendMessagesArgs = {
  // Phase 17 (17-04): a bottle-eligible game is un-provisioned; drives the guided-setup flow.
  steamBottleSetupRequired: z.tuple([z.custom<{ appName: string }>(isObject)]),
  // quick 261027-tot: progress of a first-run Steam setup payload download.
  steamSetupDownloadProgress: z.tuple([
    z.custom<SteamSetupDownloadProgress>(isObject)
  ]),
  // Phase 24 (24-06), D-05/D-06: the shared native Steam-bridge helper is not ready.
  // Phase 51 Plan 03: `missingSymbols` explains WHY; quick 261107-lum:
  // `forceWindowsViaBottle` replays the user's Windows-build choice on retry.
  steamBridgeSetupRequired: z.tuple([
    z.custom<{
      appName: string
      reason?: string
      fallbackAvailable?: boolean
      missingSymbols?: string[]
      forceWindowsViaBottle?: true
    }>(isObject)
  ]),
  // Phase 54: user.ts acquireAuthenticated emits when the go-offline wrap did not see Mac
  // Steam log off; SteamGoOfflineNotice.ts subscribes.
  steamGoOfflineRequired: z.tuple([z.custom<SteamGoOfflinePayload>(isObject)]),
  // quick 261106-pvk: one-way push when Steam never starts a delegated request.
  steamRequestNotice: z.tuple([z.custom<SteamRequestNoticePayload>(isObject)]),
  // Phase 51 Plan 03 (D-51-02/08): the one-time per-game notice fired when a game launches
  // through a stubbed interface, an identity fallback, or past a known-bad acknowledgement.
  // `userRoute` is sent back unchanged on acknowledgement so an override is never wiped.
  steamBridgeRouteNotice: z.tuple([
    z.custom<{
      appName: string
      reason: SteamBridgeRouteReason
      knownBadReason: SteamBridgeKnownBadReason | null
      missingSymbols: string[]
      route: 'bridge' | 'bottle'
      userRoute: 'bridge' | 'bottle' | null
      forceWindowsViaBottle?: true
    }>(isObject)
  ]),
  // Phase 51 Plan 03 (D-51-16): a bottled-Steam fallback launch produced no game process
  // within the grace window; `detectedCause` is `null` when no single cause was distinguishable.
  steamBottleLaunchWaiting: z.tuple([
    z.custom<{
      appName: string
      detectedCause: SteamBottleLaunchWaitingCause | null
    }>(isObject)
  ]),
  // Phase 21 (21-10), D-10/D-11: the native/host Steam client is absent ('install') or
  // installed-but-never-launched ('launch-once').
  steamClientSetupRequired: z.tuple([
    z.custom<{ appName: string; reason: 'install' | 'launch-once' }>(isObject)
  ]),
  // Throttled while Steam per-game metadata/art is fetched in the background.
  steamMetadataSyncing: z.tuple([z.strictObject({ syncing: z.boolean() })]),
  // Phase 34.15 (34.15-02), D-06/D-07: pushed on EVERY exit path of
  // SteamLibraryManager.refresh(); `reason` is present only when `status === 'failed'`.
  steamSyncStatus: z.tuple([
    z.custom<{
      status: SteamSyncStatus
      reason?: SteamSyncFailureReason
    }>(isObject)
  ]),
  progressUpdate: z.tuple([z.custom<GameStatus>(isObject)])
}

export type SteamAsync = InvokeFns<typeof steamAsyncArgs, SteamAsyncReturns>
export type SteamFrontendMessages = PushFns<typeof steamFrontendMessagesArgs>

// Phase 34.15 (34.15-02), D-06/D-07: the Steam library sync tri-state and its
// failure-reason vocabulary. Reason codes are one per distinguishable backend
// failure (Claude's Discretion under D-07), chosen so the inline notice can
// say something more useful than "failed":
//   - 'client-not-ready': the Steam session could not be re-established.
//   - 'logon-rejected': the CM was reached and REFUSED the stored-credential
//     logon (e.g. AccessDenied). Terminal, not a reconnect in flight:
//     steam-user schedules no retry after it, so a repeat replays the refusal.
//   - 'owned-apps-failed': the CM was reached but the owned-app list did not
//     arrive -- the cached library is being served instead.
//   - 'sync-failed': the owned-app list arrived but hydration threw.
// Both runtimes (Electron main + the Tauri sidecar) represent plain string
// unions identically, satisfying D-07's cross-runtime representability
// constraint.
export type SteamSyncStatus = 'idle' | 'syncing' | 'failed'
// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding). Shared-
// contract caution (common/types/ipc.ts) applied: checked for a "reserved
// for" intent signal before un-exporting -- none found, this is an ordinary
// field type of `FrontendMessages.steamSyncStatus`'s payload below, not
// deliberate API surface, so the usual `ts-prune-ignore-next` remedy (used
// twice already in this file, at :81/:185, for genuinely intentional cases)
// does not apply here.
type SteamSyncFailureReason =
  | 'client-not-ready'
  | 'logon-rejected'
  | 'owned-apps-failed'
  | 'sync-failed'
